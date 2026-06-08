import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StoragePaths } from '~/shared/config/app-config.server';
import { getStoragePaths } from '~/shared/config/app-config.server';
import { BROWSER_UPLOAD_MAX_BYTES } from '~/shared/lib/upload/browser-upload-contract';

interface BunStreamingMultipartUploadAdapterDependencies {
  maxBytes?: number;
  storagePaths?: StoragePaths;
}

interface ReceivedMultipartUpload {
  filename: string;
  mimeType: string;
  size: number;
  tempFilePath: string;
}

type MultipartPartHeaders = {
  fieldName: string;
  filename: string;
  mimeType: string;
};

class MultipartUploadError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MultipartUploadError';
  }
}

const CRLF = '\r\n';

export class BunStreamingMultipartUploadAdapter {
  private readonly maxBytes: number;
  private readonly storagePaths: StoragePaths;

  constructor(deps: BunStreamingMultipartUploadAdapterDependencies = {}) {
    this.maxBytes = deps.maxBytes ?? BROWSER_UPLOAD_MAX_BYTES;
    this.storagePaths = deps.storagePaths ?? getStoragePaths();
  }

  async receiveSingleFileUpload(request: Request): Promise<ReceivedMultipartUpload> {
    const boundary = readBoundary(request.headers.get('Content-Type'));

    if (!request.body) {
      throw new MultipartUploadError('Upload body is required', 'UPLOAD_UNAVAILABLE', 500);
    }

    const tempDirectory = path.join(this.storagePaths.stagingTempDir, randomUUID());
    const reader = request.body.getReader();
    const boundaryNeedle = Buffer.from(`${CRLF}--${boundary}`);
    let fileHeaders: MultipartPartHeaders | null = null;
    let foundFinalBoundary = false;
    let headerBuffer = Buffer.alloc(0);
    let tailBuffer = Buffer.alloc(0);
    let tempFilePath: string | null = null;
    let totalBytes = 0;
    let writer: ReturnType<typeof createWriteStream> | null = null;

    const cleanupTemp = async () => {
      if (writer) {
        writer.destroy();
      }

      await rm(tempDirectory, { force: true, recursive: true });
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = Buffer.from(value);

        if (!fileHeaders) {
          headerBuffer = Buffer.concat([headerBuffer, chunk]);
          const headerEndIndex = headerBuffer.indexOf(`${CRLF}${CRLF}`);

          if (headerEndIndex === -1) {
            continue;
          }

          fileHeaders = parseMultipartHeaders(headerBuffer.subarray(0, headerEndIndex).toString('utf8'), boundary);
          tempFilePath = path.join(tempDirectory, path.basename(fileHeaders.filename));
          await mkdir(path.dirname(tempFilePath), { recursive: true });
          writer = createWriteStream(tempFilePath);

          const remainingBody = headerBuffer.subarray(headerEndIndex + 4);
          headerBuffer = Buffer.alloc(0);

          if (remainingBody.length > 0) {
            const result = await writeMultipartBodyChunk({
              boundaryNeedle,
              chunk: remainingBody,
              currentSize: totalBytes,
              maxBytes: this.maxBytes,
              tailBuffer,
              writer,
            });
            totalBytes = result.currentSize;
            tailBuffer = result.tailBuffer;

            if (result.afterBoundary) {
              ensureFinalBoundary(result.afterBoundary);
              foundFinalBoundary = true;
              break;
            }
          }

          continue;
        }

        if (!writer) {
          throw new MultipartUploadError('Upload writer was not initialized', 'UPLOAD_UNAVAILABLE', 500);
        }

        const result = await writeMultipartBodyChunk({
          boundaryNeedle,
          chunk,
          currentSize: totalBytes,
          maxBytes: this.maxBytes,
          tailBuffer,
          writer,
        });
        totalBytes = result.currentSize;
        tailBuffer = result.tailBuffer;

        if (result.afterBoundary) {
          ensureFinalBoundary(result.afterBoundary);
          foundFinalBoundary = true;
          break;
        }
      }

      if (!fileHeaders || !tempFilePath || !writer || !foundFinalBoundary) {
        throw new MultipartUploadError('Upload stream ended before the multipart boundary closed', 'UPLOAD_UNAVAILABLE', 500);
      }

      await endWriter(writer);

      return {
        filename: fileHeaders.filename,
        mimeType: fileHeaders.mimeType,
        size: totalBytes,
        tempFilePath,
      };
    }
    catch (error) {
      await cleanupTemp();
      throw error;
    }
  }
}

async function writeMultipartBodyChunk(input: {
  boundaryNeedle: Buffer;
  chunk: Buffer;
  currentSize: number;
  maxBytes: number;
  tailBuffer: Buffer;
  writer: ReturnType<typeof createWriteStream>;
}) {
  const combined = Buffer.concat([input.tailBuffer, input.chunk]);
  const boundaryIndex = combined.indexOf(input.boundaryNeedle);

  if (boundaryIndex !== -1) {
    const fileBytes = combined.subarray(0, boundaryIndex);
    const nextSize = input.currentSize + fileBytes.length;
    assertMaxBytes(nextSize, input.maxBytes);
    await writeChunk(input.writer, fileBytes);

    return {
      afterBoundary: combined.subarray(boundaryIndex + input.boundaryNeedle.length),
      currentSize: nextSize,
      tailBuffer: Buffer.alloc(0),
    };
  }

  const safeWriteLength = Math.max(0, combined.length - input.boundaryNeedle.length);
  const fileBytes = combined.subarray(0, safeWriteLength);
  const nextSize = input.currentSize + fileBytes.length;
  assertMaxBytes(nextSize, input.maxBytes);
  await writeChunk(input.writer, fileBytes);

  return {
    afterBoundary: null,
    currentSize: nextSize,
    tailBuffer: combined.subarray(safeWriteLength),
  };
}

function assertMaxBytes(size: number, maxBytes: number) {
  if (size > maxBytes) {
    throw new MultipartUploadError('Upload exceeds the maximum supported size', 'FILE_TOO_LARGE', 413);
  }
}

function ensureFinalBoundary(buffer: Buffer) {
  if (buffer.subarray(0, 2).toString('utf8') === '--') {
    return;
  }

  if (buffer.subarray(0, 2).toString('utf8') === CRLF) {
    throw new MultipartUploadError('Only one file upload is supported', 'MULTIPLE_FILES_NOT_ALLOWED', 400);
  }

  throw new MultipartUploadError('Malformed multipart boundary termination', 'UPLOAD_UNAVAILABLE', 500);
}

function parseMultipartHeaders(headerText: string, boundary: string): MultipartPartHeaders {
  const lines = headerText.split(CRLF);

  if (lines[0] !== `--${boundary}`) {
    throw new MultipartUploadError('Malformed multipart preamble', 'UPLOAD_UNAVAILABLE', 500);
  }

  const disposition = lines.find(line => line.toLowerCase().startsWith('content-disposition:'));
  if (!disposition) {
    throw new MultipartUploadError('Missing content disposition', 'UPLOAD_UNAVAILABLE', 500);
  }

  const fieldNameMatch = disposition.match(/name="([^"]+)"/);
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  const typeLine = lines.find(line => line.toLowerCase().startsWith('content-type:'));

  if (!fieldNameMatch || !filenameMatch) {
    throw new MultipartUploadError('Missing file metadata in multipart body', 'UPLOAD_UNAVAILABLE', 500);
  }

  if (fieldNameMatch[1] !== 'file') {
    throw new MultipartUploadError('Only one file upload is supported', 'MULTIPLE_FILES_NOT_ALLOWED', 400);
  }

  return {
    fieldName: fieldNameMatch[1],
    filename: filenameMatch[1],
    mimeType: typeLine
      ? typeLine.slice(typeLine.indexOf(':') + 1).trim()
      : 'application/octet-stream',
  };
}

function readBoundary(contentType: string | null): string {
  const boundaryMatch = contentType?.match(/boundary=([^;]+)/i);

  if (!boundaryMatch) {
    throw new MultipartUploadError('Missing multipart boundary', 'UPLOAD_UNAVAILABLE', 500);
  }

  return boundaryMatch[1];
}

async function writeChunk(writer: ReturnType<typeof createWriteStream>, chunk: Buffer) {
  if (chunk.length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    writer.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function endWriter(writer: ReturnType<typeof createWriteStream>) {
  await new Promise<void>((resolve, reject) => {
    writer.end((error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

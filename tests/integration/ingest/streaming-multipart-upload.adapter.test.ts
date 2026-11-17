import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { StreamingMultipartUploadAdapter } from '../../../app/modules/ingest/infrastructure/upload/streaming-multipart-upload.adapter';

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((task) => task()));
});

function createMultipartRequest(input: {
  bodyChunks: Uint8Array[];
  boundary?: string;
  contentType?: string;
  filename?: string;
}) {
  const boundary = input.boundary ?? 'test-boundary';
  const filename = input.filename ?? 'fixture-video.mp4';
  const preamble = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${input.contentType ?? 'video/mp4'}\r\n\r\n`,
  );
  const ending = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);

  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(preamble);
        input.bodyChunks.forEach((chunk) => controller.enqueue(chunk));
        controller.enqueue(ending);
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function createErroredMultipartRequest() {
  const boundary = 'test-boundary';
  const preamble = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture-video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
  );

  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(preamble);
        controller.enqueue(new TextEncoder().encode('partial-video-data'));
        controller.error(new Error('stream interrupted'));
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

async function createAdapter(failWriter = false) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'local-streamer-streaming-upload-'));
  cleanupTasks.push(async () => rm(workspace, { force: true, recursive: true }));

  return {
    adapter: new StreamingMultipartUploadAdapter({
      createWriteStream: failWriter ? () => createWriteStream(workspace) : undefined,
      maxBytes: 16,
      storagePaths: {
        stagingDir: path.join(workspace, 'storage', 'data', 'staging'),
        stagingTempDir: path.join(workspace, 'storage', 'data', 'staging', 'temp'),
        storageDir: path.join(workspace, 'storage'),
        videosDir: path.join(workspace, 'storage', 'data', 'videos'),
      },
    }),
    workspace,
  };
}

async function expectDirectoryToBeMissingOrEmpty(directoryPath: string) {
  const entries = await readdir(directoryPath).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  expect(entries).toEqual([]);
}

describe('StreamingMultipartUploadAdapter', () => {
  test('streams one file part into a request-scoped temp path', async () => {
    const { adapter } = await createAdapter();
    const request = createMultipartRequest({
      bodyChunks: [new TextEncoder().encode('video-data')],
    });

    const result = await adapter.receiveSingleFileUpload(request);

    expect(result.tempFilePath).toContain(path.join('data', 'staging', 'temp'));
    expect(result).toEqual({
      filename: 'fixture-video.mp4',
      mimeType: 'video/mp4',
      size: 10,
      tempFilePath: result.tempFilePath,
    });
    await expect(readFile(result.tempFilePath, 'utf8')).resolves.toBe('video-data');
  });

  test('rejects unbounded multipart metadata before retaining request bytes', async () => {
    const { adapter, workspace } = await createAdapter();
    await expect(
      adapter.receiveSingleFileUpload(
        createMultipartRequest({
          bodyChunks: [new TextEncoder().encode('bytes')],
          filename: `${'a'.repeat(70_000)}.mp4`,
        }),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_METADATA_TOO_LARGE', statusCode: 413 });
    await expectDirectoryToBeMissingOrEmpty(path.join(workspace, 'storage/data/staging/temp'));
  });

  test('untrusted filenames cannot collapse the request-scoped cleanup directory', async () => {
    const { adapter, workspace } = await createAdapter();
    const result = await adapter.receiveSingleFileUpload(
      createMultipartRequest({ bodyChunks: [new TextEncoder().encode('bytes')], filename: '.' }),
    );
    expect(path.dirname(path.dirname(result.tempFilePath))).toBe(
      path.join(workspace, 'storage/data/staging/temp'),
    );
    expect(await readFile(result.tempFilePath, 'utf8')).toBe('bytes');
  });

  test('writer open failures reject the upload without an uncaught stream error', async () => {
    const { adapter, workspace } = await createAdapter(true);
    await expect(
      adapter.receiveSingleFileUpload(
        createMultipartRequest({ bodyChunks: [new TextEncoder().encode('bytes')] }),
      ),
    ).rejects.toBeInstanceOf(Error);
    await expectDirectoryToBeMissingOrEmpty(path.join(workspace, 'storage/data/staging/temp'));
  });

  test('rejects oversized uploads while cleaning the temp file', async () => {
    const { adapter, workspace } = await createAdapter();
    const request = createMultipartRequest({
      bodyChunks: [new TextEncoder().encode('0123456789abcdefg')],
    });

    await expect(adapter.receiveSingleFileUpload(request)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      statusCode: 413,
    });

    await expectDirectoryToBeMissingOrEmpty(
      path.join(workspace, 'storage', 'data', 'staging', 'temp'),
    );
  });

  test('cleans partial temp bytes when the request stream errors', async () => {
    const { adapter, workspace } = await createAdapter();

    await expect(adapter.receiveSingleFileUpload(createErroredMultipartRequest())).rejects.toThrow(
      'stream interrupted',
    );

    await expectDirectoryToBeMissingOrEmpty(
      path.join(workspace, 'storage', 'data', 'staging', 'temp'),
    );
  });
});

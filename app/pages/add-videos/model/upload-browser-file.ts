import { z } from 'zod';

const uploadResponseSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  stagingId: z.string(),
});
const uploadErrorSchema = z.object({ error: z.string().optional() });

export interface UploadBrowserFileResult {
  filename: string;
  mimeType: string;
  size: number;
  stagingId: string;
}

export interface UploadBrowserFileOptions {
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export interface UploadBrowserFileRequest {
  abort: () => void;
  done: Promise<UploadBrowserFileResult>;
}

export type UploadBrowserFile = (
  file: File,
  options?: UploadBrowserFileOptions,
) => UploadBrowserFileRequest;

function readErrorMessage(request: XMLHttpRequest): string {
  if (!request.responseText) {
    return 'Upload failed.';
  }

  try {
    const data = uploadErrorSchema.parse(JSON.parse(request.responseText));
    return data.error || 'Upload failed.';
  } catch {
    return 'Upload failed.';
  }
}

export const uploadBrowserFile: UploadBrowserFile = (file, options = {}) => {
  const request = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);

  const done = new Promise<UploadBrowserFileResult>((resolve, reject) => {
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }

      options.onProgress?.(event.loaded, event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(uploadResponseSchema.parse(JSON.parse(request.responseText)));
        } catch {
          reject(
            new Error('Upload response was invalid. Please check the upload before retrying.'),
          );
        }
        return;
      }

      reject(new Error(readErrorMessage(request)));
    });

    request.addEventListener('error', () => {
      reject(new Error('Upload failed.'));
    });

    request.addEventListener('abort', () => {
      reject(new Error('Upload aborted.'));
    });
  });

  request.open('POST', '/api/uploads');
  request.send(formData);

  return {
    abort: () => request.abort(),
    done,
  };
};

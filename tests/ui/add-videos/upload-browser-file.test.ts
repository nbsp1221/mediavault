import { afterEach, describe, expect, test, vi } from 'vitest';
import { uploadBrowserFile } from '~/pages/add-videos/model/upload-browser-file';

class FakeUploadRequest extends EventTarget {
  upload = new EventTarget();
  responseText = '';
  status = 200;
  open = vi.fn<(method: string, url: string) => void>();
  send = vi.fn<(body: FormData) => void>();
  abort = vi.fn(() => this.dispatchEvent(new Event('abort')));
}

function fixture() {
  const xhr = new FakeUploadRequest();
  vi.stubGlobal('XMLHttpRequest', function () {
    return xhr;
  });
  return xhr;
}

afterEach(() => vi.unstubAllGlobals());

describe('nonresumable browser byte transfer', () => {
  test('sends one multipart file, reports computable byte progress and validates receipt', async () => {
    const xhr = fixture();
    const onProgress = vi.fn();
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    const request = uploadBrowserFile(file, { onProgress });
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/uploads');
    expect(xhr.send.mock.calls[0]?.[0].get('file')).toBe(file);
    xhr.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: false }));
    expect(onProgress).not.toHaveBeenCalled();
    xhr.upload.dispatchEvent(
      new ProgressEvent('progress', { lengthComputable: true, loaded: 2, total: 5 }),
    );
    expect(onProgress).toHaveBeenCalledWith(2, 5);
    xhr.responseText = JSON.stringify({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      size: 5,
      stagingId: 'stage',
      success: true,
    });
    xhr.dispatchEvent(new Event('load'));
    await expect(request.done).resolves.toEqual({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      size: 5,
      stagingId: 'stage',
    });
  });

  test.each([199, 300])(
    'HTTP %i cannot accept an otherwise valid staging receipt',
    async (status) => {
      const xhr = fixture();
      const request = uploadBrowserFile(new File(['video'], 'video.mp4'));
      xhr.status = status;
      xhr.responseText = JSON.stringify({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 5,
        stagingId: 'stage',
      });
      xhr.dispatchEvent(new Event('load'));
      await expect(request.done).rejects.toBeInstanceOf(Error);
    },
  );

  test.each([{ size: -1 }, { stagingId: null }, { mimeType: 7 }])(
    'rejects a malformed receipt rather than handing its fields to the upload model: %j',
    async (invalid) => {
      const xhr = fixture();
      const request = uploadBrowserFile(new File(['video'], 'video.mp4'));
      xhr.responseText = JSON.stringify({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 5,
        stagingId: 'stage',
        ...invalid,
      });
      xhr.dispatchEvent(new Event('load'));
      await expect(request.done).rejects.toBeInstanceOf(Error);
    },
  );

  test('an empty structured server error still rejects with usable feedback', async () => {
    const xhr = fixture();
    const request = uploadBrowserFile(new File(['video'], 'video.mp4'));
    xhr.status = 503;
    xhr.responseText = JSON.stringify({ error: '' });
    xhr.dispatchEvent(new Event('load'));
    const error: unknown = await request.done.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error && error.message.trim().length > 0).toBe(true);
  });

  test('malformed successful JSON rejects instead of leaving the upload promise pending', async () => {
    const xhr = fixture();
    const request = uploadBrowserFile(new File(['video'], 'video.mp4'));
    xhr.responseText = 'invalid JSON';
    xhr.dispatchEvent(new Event('load'));
    await expect(request.done).rejects.toThrow('Upload response was invalid');
  });

  test.each(['error', 'abort', 'json', 'plaintext', 'empty'] as const)(
    'reports %s failure without exposing unstructured error pages',
    async (kind) => {
      const xhr = fixture();
      const request = uploadBrowserFile(new File(['video'], 'video.mp4'));
      if (kind === 'abort') {
        request.abort();
      } else if (kind === 'error') {
        xhr.dispatchEvent(new Event('error'));
      } else {
        xhr.status = 500;
        xhr.responseText =
          kind === 'json'
            ? JSON.stringify({ error: 'Server unavailable' })
            : kind === 'plaintext'
              ? 'private filesystem details'
              : '';
        xhr.dispatchEvent(new Event('load'));
      }
      await expect(request.done).rejects.toThrow(
        kind === 'abort'
          ? 'Upload aborted.'
          : kind === 'json'
            ? 'Server unavailable'
            : 'Upload failed.',
      );
    },
  );
});

import { describe, expect, test, vi } from 'vitest';
import { createUploadsAction } from '~/routes/.server/staged-upload-handlers';

function fixture() {
  const receiveSingleFileUpload = vi.fn(async () => ({
    filename: 'video.mp4',
    mimeType: 'video/mp4',
    size: 10,
    tempFilePath: '/isolated/temp/video.mp4',
  }));
  const execute = vi.fn(async () => ({
    ok: true as const,
    data: { filename: 'video.mp4', mimeType: 'video/mp4', size: 10, stagingId: 'stage' },
  }));
  const requireProtectedApiSessionValue = vi.fn(
    async (): Promise<Response | { userId: string }> => ({ userId: 'owner' }),
  );
  const getServerIngestServices = vi.fn(() => ({
    startStagedUpload: { execute },
    uploadBrowserFile: { receiveSingleFileUpload },
  }));
  return {
    action: createUploadsAction({ getServerIngestServices, requireProtectedApiSessionValue }),
    execute,
    getServerIngestServices,
    receiveSingleFileUpload,
    requireProtectedApiSessionValue,
  };
}

describe('source upload HTTP boundary', () => {
  test('streams an authenticated request and derives owner only from session', async () => {
    const f = fixture();
    const response = await f.action({
      params: {},
      request: new Request('http://localhost/api/uploads', { method: 'POST', body: 'bytes' }),
    });
    expect(f.execute).toHaveBeenCalledWith({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      ownerId: 'owner',
      size: 10,
      tempFilePath: '/isolated/temp/video.mp4',
    });
    await expect(response.json()).resolves.toEqual({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
      size: 10,
      stagingId: 'stage',
      success: true,
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test('denied requests never assemble services or read bytes', async () => {
    const f = fixture();
    f.requireProtectedApiSessionValue.mockResolvedValue(new Response(null, { status: 401 }));
    expect(
      (
        await f.action({
          params: {},
          request: new Request('http://localhost/api/uploads', { method: 'POST' }),
        })
      ).status,
    ).toBe(401);
    expect(f.getServerIngestServices).not.toHaveBeenCalled();
    expect(f.receiveSingleFileUpload).not.toHaveBeenCalled();
  });

  test('unsupported method is 405 and infrastructure errors never expose paths or secrets', async () => {
    const f = fixture();
    expect(
      (await f.action({ params: {}, request: new Request('http://localhost/api/uploads') })).status,
    ).toBe(405);
    expect(f.requireProtectedApiSessionValue).not.toHaveBeenCalled();
    f.receiveSingleFileUpload.mockRejectedValue(new Error('private filesystem path and key'));
    const response = await f.action({
      params: {},
      request: new Request('http://localhost/api/uploads', { method: 'POST' }),
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Upload unavailable', success: false });
  });

  test('bounded upload errors preserve their client status without converting them to success', async () => {
    const f = fixture();
    f.receiveSingleFileUpload.mockRejectedValue(
      Object.assign(new Error('File too large'), { statusCode: 413 }),
    );
    const response = await f.action({
      params: {},
      request: new Request('http://localhost/api/uploads', { method: 'POST' }),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'File too large', success: false });
  });
});

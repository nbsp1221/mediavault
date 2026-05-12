import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const ORIGINAL_STORAGE_DIR = process.env.STORAGE_DIR;

const mockDecryptThumbnail = vi.fn();

function createDecryptedThumbnailRequest(
  request: Request,
  overrides: Partial<{
    videoId: string;
  }> = {},
) {
  return {
    eTagPrefix: 'thumbnail',
    request,
    videoId: overrides.videoId ?? 'video-1',
  };
}

function createSuccessfulDecryptResult() {
  return {
    data: {
      imageBuffer: Buffer.from([1, 2, 3, 4]),
      mimeType: 'image/jpeg',
      size: 4,
      videoId: 'video-1',
    },
    success: true as const,
  };
}

async function importThumbnailComposition() {
  vi.doMock('~/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service', () => ({
    ThumbnailDecryptionService: class {
      decryptThumbnail = mockDecryptThumbnail;
    },
  }));

  return import('../../../app/composition/server/thumbnails');
}

async function importRealThumbnailComposition() {
  vi.resetModules();
  vi.doUnmock('~/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service');

  return import('../../../app/composition/server/thumbnails');
}

afterEach(() => {
  mockDecryptThumbnail.mockReset();
  vi.resetModules();
  vi.doUnmock('~/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service');

  if (ORIGINAL_STORAGE_DIR === undefined) {
    delete process.env.STORAGE_DIR;
    return;
  }

  process.env.STORAGE_DIR = ORIGINAL_STORAGE_DIR;
});

describe('thumbnail composition ownership', () => {
  test('thumbnail composition does not import app/legacy directly', async () => {
    const source = await readFile(path.resolve(PROJECT_ROOT, 'app/composition/server/thumbnails.ts'), 'utf8');

    expect(source.includes('~/legacy/'), 'thumbnail composition').toBe(false);
    expect(source.includes('app/legacy/'), 'thumbnail composition').toBe(false);
  });

  test('loadDecryptedThumbnailResponse returns 404 when the thumbnail service reports not found', async () => {
    mockDecryptThumbnail.mockResolvedValue({
      error: new Error('Encrypted thumbnail not found for video'),
      success: false,
    });

    const { loadDecryptedThumbnailResponse } = await importThumbnailComposition();
    const response = await loadDecryptedThumbnailResponse(
      createDecryptedThumbnailRequest(new Request('http://localhost/api/thumbnail/video-1')),
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('Thumbnail not found');
  });

  test('loadDecryptedThumbnailResponse returns 500 when the thumbnail service reports an unexpected error', async () => {
    mockDecryptThumbnail.mockResolvedValue({
      error: new Error('boom'),
      success: false,
    });

    const { loadDecryptedThumbnailResponse } = await importThumbnailComposition();
    const response = await loadDecryptedThumbnailResponse(
      createDecryptedThumbnailRequest(new Request('http://localhost/api/thumbnail/video-1')),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Failed to load thumbnail');
  });

  test('loadDecryptedThumbnailResponse returns 500 for invalid thumbnail ids', async () => {
    const { loadDecryptedThumbnailResponse } = await importRealThumbnailComposition();
    const response = await loadDecryptedThumbnailResponse(
      createDecryptedThumbnailRequest(
        new Request('http://localhost/api/thumbnail/not-a-uuid'),
        { videoId: 'not-a-uuid' },
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Failed to load thumbnail');
  });

  test('loadDecryptedThumbnailResponse returns 304 when If-None-Match matches the generated ETag', async () => {
    mockDecryptThumbnail.mockResolvedValue(createSuccessfulDecryptResult());

    const { loadDecryptedThumbnailResponse } = await importThumbnailComposition();
    const response = await loadDecryptedThumbnailResponse(createDecryptedThumbnailRequest(
      new Request('http://localhost/api/thumbnail/video-1', {
        headers: {
          'If-None-Match': '"thumbnail-video-1-4"',
        },
      }),
    ));

    expect(response.status).toBe(304);
  });

  test('loadDecryptedThumbnailResponse returns image payload headers without exposing storage details on success', async () => {
    mockDecryptThumbnail.mockResolvedValue(createSuccessfulDecryptResult());

    const { loadDecryptedThumbnailResponse } = await importThumbnailComposition();
    const response = await loadDecryptedThumbnailResponse(
      createDecryptedThumbnailRequest(new Request('http://localhost/api/thumbnail/video-1')),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(response.headers.get('ETag')).toBe('"thumbnail-video-1-4"');
    expect(response.headers.has('X-Content-Source')).toBe(false);
    expect((await response.arrayBuffer()).byteLength).toBe(4);
  });
});

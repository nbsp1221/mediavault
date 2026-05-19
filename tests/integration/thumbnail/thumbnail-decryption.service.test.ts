import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const VALID_JPEG_FIXTURE_PATH = join(process.cwd(), 'public', 'images', 'video-placeholder.jpg');

describe('ThumbnailDecryptionService', () => {
  const originalStorageDir = process.env.MEDIAVAULT_STORAGE_DIR;
  let rootDir: string;
  let storageDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'thumbnail-decryption-service-'));
    storageDir = join(rootDir, 'storage');
    process.env.MEDIAVAULT_STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    if (originalStorageDir === undefined) {
      delete process.env.MEDIAVAULT_STORAGE_DIR;
    }
    else {
      process.env.MEDIAVAULT_STORAGE_DIR = originalStorageDir;
    }

    await rm(rootDir, { force: true, recursive: true });
  });

  test('keeps a missing key as a decrypt failure instead of collapsing it into not-found', async () => {
    const [{ ThumbnailDecryptionService }, { ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
    ]);
    const videoId = '00000000-0000-4000-8000-000000000128';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await writeFile(thumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);
    const encryptionService = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });
    await encryptionService.encryptThumbnail({
      thumbnailPath,
      videoId,
    });
    await unlink(join(videoDir, 'key.bin'));

    const service = new ThumbnailDecryptionService({
      logger: console,
    });
    const result = await service.decryptThumbnail({ videoId });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected thumbnail decryption to fail when key.bin is missing');
    }
    expect(result.error.message).toMatch(/Failed to decrypt thumbnail:/);
    expect(result.error.message).not.toMatch(/Encrypted thumbnail not found/);
  });

  test('rejects invalid video ids before treating them as missing thumbnails', async () => {
    const { ThumbnailDecryptionService } = await import('../../../app/modules/thumbnail/infrastructure/decryption/thumbnail-decryption.service');
    const service = new ThumbnailDecryptionService({
      logger: console,
    });

    const result = await service.decryptThumbnail({
      videoId: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected invalid thumbnail id to fail validation');
    }
    expect(result.error.message).toBe('Invalid video ID format');
  });
});

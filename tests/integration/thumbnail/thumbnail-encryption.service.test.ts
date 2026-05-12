import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const VALID_JPEG_FIXTURE_PATH = join(process.cwd(), 'public', 'images', 'video-placeholder.jpg');

describe('ThumbnailEncryptionService', () => {
  const originalStorageDir = process.env.STORAGE_DIR;
  let rootDir: string;
  let storageDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'thumbnail-encryption-service-'));
    storageDir = join(rootDir, 'storage');
    process.env.STORAGE_DIR = storageDir;
  });

  afterEach(async () => {
    if (originalStorageDir === undefined) {
      delete process.env.STORAGE_DIR;
    }
    else {
      process.env.STORAGE_DIR = originalStorageDir;
    }

    await rm(rootDir, { force: true, recursive: true });
  });

  test('encrypts thumbnails as MVTH envelopes, decrypts them, and detects valid encrypted storage', async () => {
    const [{ ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
    ]);
    const videoId = '00000000-0000-4000-8000-000000000123';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await writeFile(thumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);

    const service = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });

    await service.encryptThumbnail({
      thumbnailPath,
      videoId,
    });

    const plaintext = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));
    const storedThumbnail = await readFile(thumbnailPath);

    expect(storedThumbnail).not.toEqual(plaintext);
    expect(storedThumbnail.subarray(0, 4).toString('ascii')).toBe('MVTH');
    expect(storedThumbnail[4]).toBe(1);
    await expect(service.hasEncryptedThumbnail(videoId)).resolves.toBe(true);

    await expect(service.decryptThumbnail({ videoId })).resolves.toMatchObject({
      mimeType: 'image/jpeg',
      size: plaintext.length,
    });
  });

  test('decryptThumbnail treats a missing key as a decrypt failure, not as a missing thumbnail', async () => {
    const [{ ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }, { unlink }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
      import('node:fs/promises'),
    ]);
    const videoId = '00000000-0000-4000-8000-000000000126';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await writeFile(thumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);
    const service = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });

    await service.encryptThumbnail({
      thumbnailPath,
      videoId,
    });
    await unlink(join(videoDir, 'key.bin'));

    await expect(service.decryptThumbnail({ videoId })).rejects.toThrow(
      /Failed to decrypt thumbnail:/,
    );
    await expect(service.decryptThumbnail({ videoId })).rejects.not.toThrow(
      /Encrypted thumbnail not found/,
    );
  });

  test('migrateExistingThumbnail reports missing plaintext, keeps valid encrypted content, and encrypts plaintext in place', async () => {
    const [{ ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
    ]);
    const keyManager = new Pbkdf2ThumbnailKeyManager();
    const service = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });
    const missingVideoId = '00000000-0000-4000-8000-000000000124';

    await keyManager.generateAndStoreKey(missingVideoId);
    await expect(service.migrateExistingThumbnail(missingVideoId)).resolves.toBe(false);

    const videoId = '00000000-0000-4000-8000-000000000125';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await keyManager.generateAndStoreKey(videoId);
    await writeFile(thumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    await expect(service.migrateExistingThumbnail(videoId)).resolves.toBe(true);
    await expect(service.migrateExistingThumbnail(videoId)).resolves.toBe(true);
    await expect(service.hasEncryptedThumbnail(videoId)).resolves.toBe(true);
  });

  test('migrateExistingThumbnail rejects unsupported existing bytes without rewrapping them', async () => {
    const [{ ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
    ]);
    const videoId = '00000000-0000-4000-8000-000000000129';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    const unsupportedBytes = Buffer.from('unsupported-thumbnail-bytes');
    await mkdir(videoDir, { recursive: true });
    await writeFile(thumbnailPath, unsupportedBytes);

    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);
    const service = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });

    await expect(service.migrateExistingThumbnail(videoId)).resolves.toBe(false);
    await expect(readFile(thumbnailPath)).resolves.toEqual(unsupportedBytes);
    await expect(service.hasEncryptedThumbnail(videoId)).resolves.toBe(false);
  });

  test('hasEncryptedThumbnail and decryptThumbnail reject tampered MVTH envelopes', async () => {
    const [{ ThumbnailEncryptionService }, { Pbkdf2ThumbnailKeyManager }] = await Promise.all([
      import('../../../app/modules/thumbnail/infrastructure/encryption/thumbnail-encryption.service'),
      import('../../../app/modules/thumbnail/infrastructure/security/pbkdf2-thumbnail-key-manager'),
    ]);
    const videoId = '00000000-0000-4000-8000-000000000127';
    const videoDir = join(storageDir, 'videos', videoId);
    const thumbnailPath = join(videoDir, 'thumbnail.jpg');
    await mkdir(videoDir, { recursive: true });
    await writeFile(thumbnailPath, await readFile(VALID_JPEG_FIXTURE_PATH));

    const keyManager = new Pbkdf2ThumbnailKeyManager();
    await keyManager.generateAndStoreKey(videoId);
    const service = new ThumbnailEncryptionService({
      keyManager,
      logger: console,
    });

    await service.encryptThumbnail({
      thumbnailPath,
      videoId,
    });
    const tampered = Buffer.from(await readFile(thumbnailPath));
    tampered[tampered.length - 1] ^= 0x01;
    await writeFile(thumbnailPath, tampered);

    await expect(service.hasEncryptedThumbnail(videoId)).resolves.toBe(false);
    await expect(service.decryptThumbnail({ videoId })).rejects.toThrow(
      /Failed to decrypt thumbnail:/,
    );
  });
});

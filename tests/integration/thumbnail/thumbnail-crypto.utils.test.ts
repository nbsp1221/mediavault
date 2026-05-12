import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const VALID_JPEG_FIXTURE_PATH = join(process.cwd(), 'public', 'images', 'video-placeholder.jpg');

describe('thumbnail crypto utils', () => {
  test('encryptThumbnailEnvelope writes a versioned AES-GCM envelope and round-trips jpeg bytes', async () => {
    const {
      decryptThumbnailEnvelope,
      encryptThumbnailEnvelope,
      looksLikeJpeg,
      validateEncryptedFormat,
    } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
    const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const videoId = '00000000-0000-4000-8000-000000000123';

    const encrypted = encryptThumbnailEnvelope({ imageData: payload, key, videoId });

    expect(encrypted.length).toBeGreaterThan(payload.length);
    expect(encrypted.subarray(0, 4).toString('ascii')).toBe('MVTH');
    expect(encrypted[4]).toBe(1);
    expect(looksLikeJpeg(encrypted)).toBe(false);
    expect(validateEncryptedFormat(encrypted)).toBe(true);

    const decrypted = decryptThumbnailEnvelope({ encryptedBuffer: encrypted, key, videoId });

    expect(decrypted).toEqual(payload);
  });

  test('validateEncryptedFormat rejects plaintext jpeg input', async () => {
    const { validateEncryptedFormat } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
    const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));

    expect(validateEncryptedFormat(payload)).toBe(false);
  });

  test('decryptThumbnailEnvelope rejects envelopes bound to a different video id', async () => {
    const {
      decryptThumbnailEnvelope,
      encryptThumbnailEnvelope,
    } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
    const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const encrypted = encryptThumbnailEnvelope({
      imageData: payload,
      key,
      videoId: '00000000-0000-4000-8000-000000000123',
    });

    expect(() => decryptThumbnailEnvelope({
      encryptedBuffer: encrypted,
      key,
      videoId: '00000000-0000-4000-8000-000000000124',
    })).toThrow(/Failed to authenticate thumbnail envelope/);
  });

  test('decryptThumbnailEnvelope rejects tampered ciphertext or auth tag bytes', async () => {
    const {
      decryptThumbnailEnvelope,
      encryptThumbnailEnvelope,
    } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
    const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));
    const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const videoId = '00000000-0000-4000-8000-000000000123';
    const encrypted = encryptThumbnailEnvelope({ imageData: payload, key, videoId });
    const tamperedCiphertext = Buffer.from(encrypted);
    const tamperedAuthTag = Buffer.from(encrypted);

    tamperedCiphertext[tamperedCiphertext.length - 1] ^= 0x01;
    tamperedAuthTag[5 + 12] ^= 0x01;

    expect(() => decryptThumbnailEnvelope({
      encryptedBuffer: tamperedCiphertext,
      key,
      videoId,
    })).toThrow(/Failed to authenticate thumbnail envelope/);
    expect(() => decryptThumbnailEnvelope({
      encryptedBuffer: tamperedAuthTag,
      key,
      videoId,
    })).toThrow(/Failed to authenticate thumbnail envelope/);
  });

  test('looksLikeJpeg accepts the tracked fixture and rejects malformed data', async () => {
    const { looksLikeJpeg } = await import('../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils');
    const payload = Buffer.from(await readFile(VALID_JPEG_FIXTURE_PATH));

    expect(looksLikeJpeg(payload)).toBe(true);
    expect(looksLikeJpeg(Buffer.from([0x00, 0x11, 0x22, 0x33]))).toBe(false);
  });
});

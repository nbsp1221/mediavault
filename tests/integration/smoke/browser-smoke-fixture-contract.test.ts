import { access, readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  decryptThumbnailEnvelope,
  looksLikeJpeg,
} from '../../../app/modules/thumbnail/infrastructure/crypto/thumbnail-crypto.utils';

const REQUIRED_PLAYBACK_FIXTURE_IDS = [
  '68e5f819-15e8-41ef-90ee-8a96769311b7',
  '754c6828-621c-4df6-9cf8-a3d77297b85a',
] as const;

describe('browser smoke fixture contract', () => {
  test('stores required upload and playback smoke fixtures under tracked test-owned surfaces', async () => {
    await expect(access('tests/support/playback-fixture-manifest.ts')).resolves.toBeUndefined();
    await expect(access('tests/fixtures/upload/smoke-upload.mp4')).resolves.toBeUndefined();

    const manifestSource = await readFile('tests/support/playback-fixture-manifest.ts', 'utf8');
    expect(manifestSource).toContain('tests/fixtures/playback');
    expect(manifestSource).not.toContain('process.cwd(), \'storage\'');

    for (const fixtureId of REQUIRED_PLAYBACK_FIXTURE_IDS) {
      await expect(access(`tests/fixtures/playback/${fixtureId}/manifest.mpd`)).resolves.toBeUndefined();
      await expect(access(`tests/fixtures/playback/${fixtureId}/video/init.mp4`)).resolves.toBeUndefined();
      await expect(access(`tests/fixtures/playback/${fixtureId}/audio/init.mp4`)).resolves.toBeUndefined();
      await expect(access(`tests/fixtures/playback/${fixtureId}/key.bin`)).resolves.toBeUndefined();
      await expect(access(`tests/fixtures/playback/${fixtureId}/thumbnail.jpg`)).resolves.toBeUndefined();
    }
  });

  test('stores required playback fixture thumbnails as decryptable MVTH JPEG envelopes', async () => {
    for (const fixtureId of REQUIRED_PLAYBACK_FIXTURE_IDS) {
      const key = await readFile(`tests/fixtures/playback/${fixtureId}/key.bin`);
      const encryptedThumbnail = await readFile(`tests/fixtures/playback/${fixtureId}/thumbnail.jpg`);
      const plaintextThumbnail = decryptThumbnailEnvelope({
        encryptedBuffer: encryptedThumbnail,
        key,
        videoId: fixtureId,
      });

      expect(encryptedThumbnail.subarray(0, 4).toString('ascii')).toBe('MVTH');
      expect(encryptedThumbnail[4]).toBe(1);
      expect(looksLikeJpeg(plaintextThumbnail), fixtureId).toBe(true);
    }
  });
});

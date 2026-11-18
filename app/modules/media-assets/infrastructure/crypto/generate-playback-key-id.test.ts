import crypto from 'node:crypto';
import { expect, test } from 'vitest';
import { generatePlaybackKeyId } from './generate-playback-key-id.server';

test('preserves the canonical 16-byte SHA-256 playback key identifier', () => {
  expect(generatePlaybackKeyId('video-1')).toBe(
    crypto.createHash('sha256').update('video-1').digest().subarray(0, 16).toString('hex'),
  );
});

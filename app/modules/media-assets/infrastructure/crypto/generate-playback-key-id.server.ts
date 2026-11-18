import crypto from 'node:crypto';

export function generatePlaybackKeyId(videoId: string): string {
  return crypto.createHash('sha256').update(videoId).digest().subarray(0, 16).toString('hex');
}

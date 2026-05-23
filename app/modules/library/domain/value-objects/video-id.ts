const VIDEO_ID_UNSAFE_PATTERN = /[\\/]|(?:^|\/)\.\.(?:\/|$)/;

export type CreateVideoIdResult =
  | { ok: true; videoId: string }
  | { ok: false; reason: 'VIDEO_ID_REQUIRED' | 'VIDEO_ID_UNSAFE' };

export function createVideoId(rawVideoId: string): CreateVideoIdResult {
  const videoId = rawVideoId.trim();

  if (!videoId) {
    return {
      ok: false,
      reason: 'VIDEO_ID_REQUIRED',
    };
  }

  if (VIDEO_ID_UNSAFE_PATTERN.test(videoId) || videoId.includes('..') || videoId.includes('\0')) {
    return {
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    };
  }

  return {
    ok: true,
    videoId,
  };
}

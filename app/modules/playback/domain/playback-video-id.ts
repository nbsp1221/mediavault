const PLAYBACK_VIDEO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isValidPlaybackVideoId(videoId: string): boolean {
  if (typeof videoId !== 'string') {
    return false;
  }

  if (videoId.length === 0 || videoId.length > 255) {
    return false;
  }

  if (videoId.trim() !== videoId) {
    return false;
  }

  if (
    videoId.includes('..') ||
    videoId.includes('/') ||
    videoId.includes('\\') ||
    videoId.includes('\0')
  ) {
    return false;
  }

  return PLAYBACK_VIDEO_ID_PATTERN.test(videoId);
}

export function assertValidPlaybackVideoId(videoId: string): asserts videoId is string {
  if (!isValidPlaybackVideoId(videoId)) {
    throw Object.assign(new Error('Invalid video ID format'), {
      name: 'ValidationError',
    });
  }
}

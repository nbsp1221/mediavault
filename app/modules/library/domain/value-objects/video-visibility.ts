export type VideoVisibility = 'private' | 'public';

export type CreateVideoVisibilityResult =
  | { ok: true; visibility: VideoVisibility }
  | { ok: false; reason: 'VIDEO_VISIBILITY_INVALID' };

export function createVideoVisibility(value: unknown): CreateVideoVisibilityResult {
  if (value === 'private' || value === 'public') {
    return {
      ok: true,
      visibility: value,
    };
  }

  return {
    ok: false,
    reason: 'VIDEO_VISIBILITY_INVALID',
  };
}

export function isPublicVisibility(visibility: VideoVisibility): boolean {
  return visibility === 'public';
}

export function isPrivateVisibility(visibility: VideoVisibility): boolean {
  return visibility === 'private';
}

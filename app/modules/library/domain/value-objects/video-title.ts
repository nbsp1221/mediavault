export type CreateVideoTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'VIDEO_TITLE_REQUIRED' };

export function createVideoTitle(rawTitle: string): CreateVideoTitleResult {
  const title = rawTitle.trim();

  if (!title) {
    return {
      ok: false,
      reason: 'VIDEO_TITLE_REQUIRED',
    };
  }

  return {
    ok: true,
    title,
  };
}

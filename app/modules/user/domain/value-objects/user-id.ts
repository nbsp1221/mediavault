const USER_ID_UNSAFE_PATTERN = /[\\/]|(?:^|\/)\.\.(?:\/|$)/;

export type CreateUserIdResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'USER_ID_REQUIRED' | 'USER_ID_UNSAFE' };

export function createUserId(rawUserId: string): CreateUserIdResult {
  const userId = rawUserId.trim();

  if (!userId) {
    return {
      ok: false,
      reason: 'USER_ID_REQUIRED',
    };
  }

  if (USER_ID_UNSAFE_PATTERN.test(userId) || userId.includes('..') || userId.includes('\0')) {
    return {
      ok: false,
      reason: 'USER_ID_UNSAFE',
    };
  }

  return {
    ok: true,
    userId,
  };
}

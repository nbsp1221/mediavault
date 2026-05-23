const USERNAME_WHITESPACE_PATTERN = /\s+/g;
const USERNAME_UNSAFE_PATTERN = /[\\/]|(?:^|\/)\.\.(?:\/|$)/;

export type CreateUsernameResult =
  | { ok: true; username: string; usernameKey: string }
  | { ok: false; reason: 'USERNAME_REQUIRED' | 'USERNAME_UNSAFE' };

export function normalizeUsernameKey(rawUsername: string): string | null {
  const usernameKey = rawUsername
    .trim()
    .toLowerCase()
    .replace(USERNAME_WHITESPACE_PATTERN, ' ');

  return usernameKey || null;
}

export function createUsername(rawUsername: string): CreateUsernameResult {
  const username = rawUsername.trim();

  if (!username) {
    return {
      ok: false,
      reason: 'USERNAME_REQUIRED',
    };
  }

  if (USERNAME_UNSAFE_PATTERN.test(username) || username.includes('..') || username.includes('\0')) {
    return {
      ok: false,
      reason: 'USERNAME_UNSAFE',
    };
  }

  return {
    ok: true,
    username,
    usernameKey: normalizeUsernameKey(username)!,
  };
}

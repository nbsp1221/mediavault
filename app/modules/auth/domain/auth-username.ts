const USERNAME_WHITESPACE_PATTERN = /\s+/g;
const USERNAME_UNSAFE_PATTERN = /[\\/]|(?:^|\/)\.\.(?:\/|$)/;

export type CreateAuthUsernameResult =
  | { username: string; usernameKey: string }
  | { error: 'USERNAME_REQUIRED' | 'USERNAME_UNSAFE'; ok: false };

export function normalizeAuthUsernameKey(rawUsername: string): string | null {
  const usernameKey = rawUsername
    .trim()
    .toLowerCase()
    .replace(USERNAME_WHITESPACE_PATTERN, ' ');

  return usernameKey || null;
}

export function createAuthUsername(rawUsername: string): CreateAuthUsernameResult {
  const username = rawUsername.trim();

  if (!username) {
    return {
      error: 'USERNAME_REQUIRED',
      ok: false,
    };
  }

  if (USERNAME_UNSAFE_PATTERN.test(username) || username.includes('..') || username.includes('\0')) {
    return {
      error: 'USERNAME_UNSAFE',
      ok: false,
    };
  }

  return {
    username,
    usernameKey: normalizeAuthUsernameKey(username)!,
  };
}

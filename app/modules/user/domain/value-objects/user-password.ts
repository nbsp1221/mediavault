const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 128;

export type UserPasswordValidationResult =
  | { ok: true }
  | { ok: false; reason: 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_HAS_LINE_BREAK' };

export function validateUserPassword(password: string): UserPasswordValidationResult {
  if (password.includes('\r') || password.includes('\n')) {
    return { ok: false, reason: 'PASSWORD_HAS_LINE_BREAK' };
  }
  const length = Array.from(password).length;

  if (length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'PASSWORD_TOO_SHORT',
    };
  }

  if (length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'PASSWORD_TOO_LONG',
    };
  }

  return { ok: true };
}

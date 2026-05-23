const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;

export type UserPasswordValidationResult =
  | { ok: true }
  | { ok: false; reason: 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_SHORT' };

export function validateUserPassword(password: string): UserPasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'PASSWORD_TOO_SHORT',
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'PASSWORD_TOO_LONG',
    };
  }

  return { ok: true };
}

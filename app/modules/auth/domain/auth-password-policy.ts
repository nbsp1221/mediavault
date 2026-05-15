const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;

export type AuthPasswordValidationResult =
  | { ok: true }
  | { error: 'PASSWORD_TOO_LONG' | 'PASSWORD_TOO_SHORT'; ok: false };

export function validateAuthPassword(password: string): AuthPasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: 'PASSWORD_TOO_SHORT',
      ok: false,
    };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      error: 'PASSWORD_TOO_LONG',
      ok: false,
    };
  }

  return { ok: true };
}

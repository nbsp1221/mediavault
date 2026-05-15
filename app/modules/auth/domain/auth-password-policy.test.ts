import { describe, expect, test } from 'vitest';
import { validateAuthPassword } from './auth-password-policy';

describe('auth password policy', () => {
  test('rejects passwords shorter than four characters', () => {
    expect(validateAuthPassword('abc')).toEqual({
      error: 'PASSWORD_TOO_SHORT',
      ok: false,
    });
  });

  test('accepts passwords with four characters', () => {
    expect(validateAuthPassword('abcd')).toEqual({ ok: true });
  });

  test('accepts passwords with sixty-four characters', () => {
    expect(validateAuthPassword('a'.repeat(64))).toEqual({ ok: true });
  });

  test('rejects passwords longer than sixty-four characters', () => {
    expect(validateAuthPassword('a'.repeat(65))).toEqual({
      error: 'PASSWORD_TOO_LONG',
      ok: false,
    });
  });
});

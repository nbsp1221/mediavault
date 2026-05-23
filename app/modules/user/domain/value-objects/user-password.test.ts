import { describe, expect, test } from 'vitest';
import { validateUserPassword } from './user-password';

describe('validateUserPassword', () => {
  test('accepts passwords in the supported length range', () => {
    expect(validateUserPassword('abcd')).toEqual({ ok: true });
    expect(validateUserPassword('a'.repeat(64))).toEqual({ ok: true });
  });

  test('rejects passwords outside the supported length range', () => {
    expect(validateUserPassword('abc')).toEqual({
      ok: false,
      reason: 'PASSWORD_TOO_SHORT',
    });
    expect(validateUserPassword('a'.repeat(65))).toEqual({
      ok: false,
      reason: 'PASSWORD_TOO_LONG',
    });
  });
});

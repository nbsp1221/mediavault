import { describe, expect, test } from 'vitest';
import { validateUserPassword } from './user-password';

describe('validateUserPassword', () => {
  test.each([15, 128])('accepts %i Unicode code points', (length) => {
    expect(validateUserPassword('a'.repeat(length))).toEqual({ ok: true });
    expect(validateUserPassword('🔒'.repeat(length))).toEqual({ ok: true });
  });

  test('preserves whitespace and accepts Unicode without composition requirements', () => {
    expect(validateUserPassword(' '.repeat(15))).toEqual({ ok: true });
    expect(validateUserPassword('이 비밀번호는 공백과 한글을 포함합니다')).toEqual({ ok: true });
    expect(validateUserPassword('abcdefghijklmnop')).toEqual({ ok: true });
  });

  test.each(['\r', '\n', '\r\n'])(
    'rejects native password-field line breaks %# without trimming',
    (lineBreak) => {
      expect(validateUserPassword('a'.repeat(14) + lineBreak)).toEqual({
        ok: false,
        reason: 'PASSWORD_HAS_LINE_BREAK',
      });
    },
  );

  test.each(['', 'a'.repeat(14), '🔒'.repeat(14)])(
    'rejects fewer than fifteen code points',
    (password) => {
      expect(validateUserPassword(password)).toEqual({ ok: false, reason: 'PASSWORD_TOO_SHORT' });
    },
  );

  test.each(['a'.repeat(129), '🔒'.repeat(129)])(
    'rejects more than 128 code points',
    (password) => {
      expect(validateUserPassword(password)).toEqual({ ok: false, reason: 'PASSWORD_TOO_LONG' });
    },
  );
});

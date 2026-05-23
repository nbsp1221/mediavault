import { describe, expect, test } from 'vitest';
import { createUserId } from './user-id';

describe('createUserId', () => {
  test('accepts a trimmed user id', () => {
    expect(createUserId(' user-1 ')).toEqual({
      ok: true,
      userId: 'user-1',
    });
  });

  test('rejects missing and unsafe user ids', () => {
    expect(createUserId('   ')).toEqual({
      ok: false,
      reason: 'USER_ID_REQUIRED',
    });
    expect(createUserId('../owner')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
    expect(createUserId('owner/..')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
    expect(createUserId('..')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
    expect(createUserId('owner/name')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
    expect(createUserId('owner\\name')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
    expect(createUserId('owner\0name')).toEqual({
      ok: false,
      reason: 'USER_ID_UNSAFE',
    });
  });
});

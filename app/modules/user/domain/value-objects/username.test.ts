import { describe, expect, test } from 'vitest';
import {
  createUsername,
  normalizeUsernameKey,
} from './username';

describe('username', () => {
  test('trims display username and normalizes lookup key', () => {
    expect(createUsername('  OwnerName  ')).toEqual({
      ok: true,
      username: 'OwnerName',
      usernameKey: 'ownername',
    });

    expect(createUsername('  Owner   Name  ')).toEqual({
      ok: true,
      username: 'Owner   Name',
      usernameKey: 'owner name',
    });
  });

  test('rejects missing and unsafe usernames', () => {
    expect(createUsername('   ')).toEqual({
      ok: false,
      reason: 'USERNAME_REQUIRED',
    });
    expect(createUsername('../owner')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
    expect(createUsername('owner/../admin')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
    expect(createUsername('owner..name')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
    expect(createUsername('owner/name')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
    expect(createUsername('owner\\name')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
    expect(createUsername('owner\0name')).toEqual({
      ok: false,
      reason: 'USERNAME_UNSAFE',
    });
  });

  test('normalizes blank keys to null', () => {
    expect(normalizeUsernameKey('  OWNER   Name  ')).toBe('owner name');
    expect(normalizeUsernameKey('   ')).toBeNull();
  });
});

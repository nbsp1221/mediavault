import { describe, expect, test } from 'vitest';
import {
  createAuthUsername,
  normalizeAuthUsernameKey,
} from './auth-username';

describe('auth username helpers', () => {
  test('trims display username and lowercases the lookup key', () => {
    expect(createAuthUsername('  OwnerName  ')).toEqual({
      username: 'OwnerName',
      usernameKey: 'ownername',
    });
  });

  test('collapses internal whitespace in the lookup key', () => {
    expect(createAuthUsername('  Owner   Name  ')).toEqual({
      username: 'Owner   Name',
      usernameKey: 'owner name',
    });
  });

  test('rejects blank usernames', () => {
    expect(createAuthUsername('   ')).toEqual({
      error: 'USERNAME_REQUIRED',
      ok: false,
    });
  });

  test('rejects unsafe path-like usernames', () => {
    expect(createAuthUsername('../owner')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
    expect(createAuthUsername('owner/../admin')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
    expect(createAuthUsername('owner..name')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
    expect(createAuthUsername('owner/name')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
    expect(createAuthUsername('owner\\name')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
    expect(createAuthUsername('owner\u0000name')).toEqual({
      error: 'USERNAME_UNSAFE',
      ok: false,
    });
  });

  test('normalizes username keys for direct repository lookup', () => {
    expect(normalizeAuthUsernameKey('  OWNER   Name  ')).toBe('owner name');
    expect(normalizeAuthUsernameKey('   ')).toBeNull();
  });
});

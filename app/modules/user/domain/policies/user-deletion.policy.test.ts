import { describe, expect, test } from 'vitest';
import { UserDeletionPolicy } from './user-deletion.policy';

describe('UserDeletionPolicy', () => {
  test('allows deletion when the user owns no videos', () => {
    expect(UserDeletionPolicy.evaluate({
      ownedVideoCount: 0,
    })).toEqual({ allowed: true });
  });

  test('blocks deletion when the user owns videos', () => {
    expect(UserDeletionPolicy.evaluate({
      ownedVideoCount: 1,
    })).toEqual({
      allowed: false,
      reason: 'USER_OWNS_VIDEOS',
    });
  });
});

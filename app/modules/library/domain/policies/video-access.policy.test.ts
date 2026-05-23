import { describe, expect, test } from 'vitest';
import { type VideoAccessOperation, VideoAccessPolicy } from './video-access.policy';

const operations: VideoAccessOperation[] = ['view', 'play', 'edit', 'delete', 'manage_visibility'];

describe('VideoAccessPolicy', () => {
  test('allows owners to perform every video operation', () => {
    for (const operation of operations) {
      expect(VideoAccessPolicy.evaluate({
        operation,
        ownerId: 'user-1',
        viewer: {
          type: 'authenticated',
          userId: 'user-1',
        },
        visibility: 'private',
      })).toEqual({ allowed: true });
    }
  });

  test('allows anonymous and non-owner viewers to view and play public videos only', () => {
    for (const viewer of [
      { type: 'anonymous' as const },
      { type: 'authenticated' as const, userId: 'user-2' },
    ]) {
      expect(VideoAccessPolicy.evaluate({
        operation: 'view',
        ownerId: 'user-1',
        viewer,
        visibility: 'public',
      })).toEqual({ allowed: true });
      expect(VideoAccessPolicy.evaluate({
        operation: 'play',
        ownerId: 'user-1',
        viewer,
        visibility: 'public',
      })).toEqual({ allowed: true });
      expect(VideoAccessPolicy.evaluate({
        operation: 'edit',
        ownerId: 'user-1',
        viewer,
        visibility: 'public',
      })).toEqual({
        allowed: false,
        reason: 'VIDEO_NOT_ACCESSIBLE',
      });
    }
  });

  test('denies private videos to anonymous and non-owner viewers', () => {
    for (const viewer of [
      { type: 'anonymous' as const },
      { type: 'authenticated' as const, userId: 'user-2' },
    ]) {
      for (const operation of operations) {
        expect(VideoAccessPolicy.evaluate({
          operation,
          ownerId: 'user-1',
          viewer,
          visibility: 'private',
        })).toEqual({
          allowed: false,
          reason: 'VIDEO_NOT_ACCESSIBLE',
        });
      }
    }
  });
});

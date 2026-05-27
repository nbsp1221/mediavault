import { describe, expect, test } from 'vitest';
import type { VideoVisibility } from '../value-objects/video-visibility';
import {
  type VideoAccessOperation,
  type VideoViewer,
  canAccessVideoForRead,
  VideoAccessPolicy,
} from './video-access.policy';

const operations: VideoAccessOperation[] = ['view', 'play', 'edit', 'delete', 'manage_visibility'];

describe('VideoAccessPolicy', () => {
  const viewers: Array<{
    name: string;
    viewer: VideoViewer;
  }> = [
    {
      name: 'anonymous',
      viewer: { type: 'anonymous' },
    },
    {
      name: 'owner',
      viewer: {
        type: 'authenticated',
        userId: 'user-1',
      },
    },
    {
      name: 'authenticated non-owner',
      viewer: {
        type: 'authenticated',
        userId: 'user-2',
      },
    },
  ];

  const visibilities: VideoVisibility[] = ['public', 'private'];

  test.each(viewers)('evaluates every visibility and operation for $name viewers', ({ name, viewer }) => {
    for (const visibility of visibilities) {
      for (const operation of operations) {
        const expectedAllowed = name === 'owner' ||
          (visibility === 'public' && (operation === 'view' || operation === 'play'));

        expect(VideoAccessPolicy.evaluate({
          operation,
          ownerId: 'user-1',
          viewer,
          visibility,
        })).toEqual(expectedAllowed
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'VIDEO_NOT_ACCESSIBLE',
            });
      }
    }
  });

  test('keeps the read helper equivalent to the view operation', () => {
    for (const { viewer } of viewers) {
      for (const visibility of visibilities) {
        const policyDecision = VideoAccessPolicy.evaluate({
          operation: 'view',
          ownerId: 'user-1',
          viewer,
          visibility,
        });

        expect(canAccessVideoForRead(viewer, {
          ownerId: 'user-1',
          visibility,
        })).toBe(policyDecision.allowed);
      }
    }
  });

  test('describes edit, delete, and visibility-management permissions from the same policy matrix', () => {
    expect(VideoAccessPolicy.describePermissions({
      ownerId: 'user-1',
      viewer: {
        type: 'authenticated',
        userId: 'user-1',
      },
      visibility: 'private',
    })).toEqual({
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    });

    expect(VideoAccessPolicy.describePermissions({
      ownerId: 'user-1',
      viewer: {
        type: 'authenticated',
        userId: 'user-2',
      },
      visibility: 'public',
    })).toEqual({
      canDelete: false,
      canEdit: false,
      canManageVisibility: false,
    });
  });
});

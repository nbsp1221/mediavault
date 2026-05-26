import { describe, expect, test } from 'vitest';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoVisibility } from '../../domain/value-objects/video-visibility';
import {
  type VideoViewer,
  canAccessVideoForRead,
  VideoAccessPolicy,
} from '../../domain/policies/video-access.policy';
import { type VideoReadAccessScope, createVideoReadAccessScope } from './video-read-access-scope';

function createVideo(visibility: VideoVisibility): LibraryVideo {
  return {
    createdAt: new Date('2026-03-27T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    ownerId: 'owner-1',
    tags: ['action'],
    title: 'Fixture Video',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility,
  };
}

function matchesScope(scope: VideoReadAccessScope, video: LibraryVideo): boolean {
  if (scope.type === 'public_only') {
    return video.visibility === 'public';
  }

  return video.visibility === 'public' || video.ownerId === scope.ownerId;
}

describe('VideoReadAccessScope', () => {
  const viewers: Array<{
    expectedScope: VideoReadAccessScope;
    viewer: VideoViewer;
  }> = [
    {
      expectedScope: { type: 'public_only' },
      viewer: { type: 'anonymous' },
    },
    {
      expectedScope: {
        ownerId: 'owner-1',
        type: 'public_or_owned',
      },
      viewer: {
        type: 'authenticated',
        userId: 'owner-1',
      },
    },
    {
      expectedScope: {
        ownerId: 'other-user',
        type: 'public_or_owned',
      },
      viewer: {
        type: 'authenticated',
        userId: 'other-user',
      },
    },
  ];

  test.each(viewers)('derives the canonical read scope for a viewer', ({ expectedScope, viewer }) => {
    expect(createVideoReadAccessScope(viewer)).toEqual(expectedScope);
  });

  test('keeps read scope equivalent to the object-level view policy', () => {
    for (const { viewer } of viewers) {
      const scope = createVideoReadAccessScope(viewer);

      for (const visibility of ['public', 'private'] as const) {
        const video = createVideo(visibility);
        const policyDecision = VideoAccessPolicy.evaluate({
          operation: 'view',
          ownerId: video.ownerId,
          viewer,
          visibility: video.visibility,
        });

        expect(matchesScope(scope, video)).toBe(policyDecision.allowed);
        expect(canAccessVideoForRead(viewer, video)).toBe(matchesScope(scope, video));
      }
    }
  });
});

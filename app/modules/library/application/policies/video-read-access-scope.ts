import type { VideoViewer } from '../../domain/policies/video-access.policy';

export type VideoReadAccessScope =
  | { type: 'public_only' }
  | { ownerId: string; type: 'public_or_owned' };

export function createVideoReadAccessScope(viewer: VideoViewer): VideoReadAccessScope {
  if (viewer.type === 'anonymous') {
    return { type: 'public_only' };
  }

  return {
    ownerId: viewer.userId,
    type: 'public_or_owned',
  };
}

import type { RequestViewer } from '~/modules/auth/domain/request-viewer';
import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';

export function toVideoPolicyViewer(viewer: RequestViewer): VideoViewer {
  if (viewer.type === 'anonymous') {
    return {
      type: 'anonymous',
    };
  }

  return {
    type: 'authenticated',
    userId: viewer.userId,
  };
}

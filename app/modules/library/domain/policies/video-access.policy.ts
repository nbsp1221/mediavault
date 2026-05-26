import type { VideoVisibility } from '../value-objects/video-visibility';

export type VideoAccessOperation =
  | 'view'
  | 'play'
  | 'edit'
  | 'delete'
  | 'manage_visibility';

export type VideoViewer =
  | { type: 'anonymous' }
  | { type: 'authenticated'; userId: string };

export type VideoAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'VIDEO_NOT_ACCESSIBLE' };

export interface VideoAccessPolicyInput {
  operation: VideoAccessOperation;
  ownerId: string;
  viewer: VideoViewer;
  visibility: VideoVisibility;
}

interface VideoAccessPolicyVideo {
  ownerId: string;
  visibility: VideoVisibility;
}

export class VideoAccessPolicy {
  static evaluate(input: VideoAccessPolicyInput): VideoAccessDecision {
    const isOwner = input.viewer.type === 'authenticated' && input.viewer.userId === input.ownerId;

    if (isOwner) {
      return { allowed: true };
    }

    if (input.visibility === 'public' && (input.operation === 'view' || input.operation === 'play')) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'VIDEO_NOT_ACCESSIBLE',
    };
  }
}

export function canAccessVideoForRead(viewer: VideoViewer, video: VideoAccessPolicyVideo): boolean {
  return VideoAccessPolicy.evaluate({
    operation: 'view',
    ownerId: video.ownerId,
    viewer,
    visibility: video.visibility,
  }).allowed;
}

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

export interface VideoPermissions {
  canDelete: boolean;
  canEdit: boolean;
  canManageVisibility: boolean;
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

  static describePermissions(input: Omit<VideoAccessPolicyInput, 'operation'>): VideoPermissions {
    return {
      canDelete: this.evaluate({
        ...input,
        operation: 'delete',
      }).allowed,
      canEdit: this.evaluate({
        ...input,
        operation: 'edit',
      }).allowed,
      canManageVisibility: this.evaluate({
        ...input,
        operation: 'manage_visibility',
      }).allowed,
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

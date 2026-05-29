import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { VideoVisibility } from '../../domain/value-objects/video-visibility';
import type { LibraryVideoVisibilityMutationPort } from '../ports/library-video-mutation.port';
import { VideoAccessPolicy } from '../../domain/policies/video-access.policy';
import { createVideoVisibility } from '../../domain/value-objects/video-visibility';

export interface ChangeLibraryVideoVisibilityInput {
  viewer: VideoViewer;
  videoId: string;
  visibility: unknown;
}

interface ChangeLibraryVideoVisibilitySuccess {
  ok: true;
  data: {
    message: string;
    video: LibraryVideo;
  };
}

interface ChangeLibraryVideoVisibilityFailure {
  ok: false;
  reason: 'INVALID_INPUT' | 'VIDEO_NOT_FOUND' | 'FORBIDDEN' | 'UPDATE_FAILED';
  message: string;
}

export type ChangeLibraryVideoVisibilityUseCaseResult =
  | ChangeLibraryVideoVisibilitySuccess
  | ChangeLibraryVideoVisibilityFailure;

interface ChangeLibraryVideoVisibilityUseCaseDependencies {
  videoMutation: LibraryVideoVisibilityMutationPort;
}

function canManageVisibility(input: {
  existingVideo: LibraryVideo;
  viewer: VideoViewer;
}) {
  return VideoAccessPolicy.evaluate({
    operation: 'manage_visibility',
    ownerId: input.existingVideo.ownerId,
    viewer: input.viewer,
    visibility: input.existingVideo.visibility,
  }).allowed;
}

function formatVisibilityLabel(visibility: VideoVisibility) {
  return visibility === 'public' ? 'Public' : 'Private';
}

export class ChangeLibraryVideoVisibilityUseCase {
  constructor(
    private readonly deps: ChangeLibraryVideoVisibilityUseCaseDependencies,
  ) {}

  async execute(input: ChangeLibraryVideoVisibilityInput): Promise<ChangeLibraryVideoVisibilityUseCaseResult> {
    const videoId = input.videoId.trim();

    if (videoId.length === 0) {
      return {
        message: 'Video ID is required',
        ok: false,
        reason: 'INVALID_INPUT',
      };
    }

    if (input.viewer.type !== 'authenticated') {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    const target = await this.deps.videoMutation.resolveVisibilityManagementTarget({
      requesterId: input.viewer.userId,
      videoId,
    });

    if (target.type === 'public_non_owner') {
      return {
        message: 'Video visibility cannot be changed by this viewer',
        ok: false,
        reason: 'FORBIDDEN',
      };
    }

    if (target.type === 'not_found_or_private_inaccessible') {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    const requestedVisibility = createVideoVisibility(input.visibility);
    if (!requestedVisibility.ok) {
      return {
        message: 'Video visibility must be public or private',
        ok: false,
        reason: 'INVALID_INPUT',
      };
    }

    if (!canManageVisibility({ existingVideo: target.video, viewer: input.viewer })) {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    if (target.video.visibility === requestedVisibility.visibility) {
      return {
        data: {
          message: `Visibility updated to ${formatVisibilityLabel(target.video.visibility)}.`,
          video: target.video,
        },
        ok: true,
      };
    }

    const updatedVideo = await this.deps.videoMutation.updateLibraryVideoVisibility({
      ownerId: input.viewer.userId,
      videoId,
      visibility: requestedVisibility.visibility,
    });

    if (!updatedVideo) {
      return {
        message: 'Failed to update visibility',
        ok: false,
        reason: 'UPDATE_FAILED',
      };
    }

    return {
      data: {
        message: `Visibility updated to ${formatVisibilityLabel(updatedVideo.visibility)}.`,
        video: updatedVideo,
      },
      ok: true,
    };
  }
}

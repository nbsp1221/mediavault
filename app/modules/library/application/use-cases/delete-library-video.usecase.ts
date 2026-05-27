import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { LibraryVideoArtifactRemovalPort } from '../ports/library-video-artifact-removal.port';
import type { LibraryVideoMutationPort } from '../ports/library-video-mutation.port';
import { VideoAccessPolicy } from '../../domain/policies/video-access.policy';

export interface DeleteLibraryVideoInput {
  viewer: VideoViewer;
  videoId: string;
}

interface DeleteLibraryVideoSuccess {
  ok: true;
  data: {
    message: string;
    title: string;
    videoId: string;
    warning?: string;
  };
}

interface DeleteLibraryVideoFailure {
  ok: false;
  reason: 'INVALID_INPUT' | 'VIDEO_NOT_FOUND' | 'DELETE_FAILED';
  message: string;
}

export type DeleteLibraryVideoUseCaseResult =
  | DeleteLibraryVideoSuccess
  | DeleteLibraryVideoFailure;

interface DeleteLibraryVideoUseCaseDependencies {
  videoArtifacts: LibraryVideoArtifactRemovalPort;
  videoMutation: LibraryVideoMutationPort;
}

function canDeleteVideo(input: {
  existingVideo: LibraryVideo;
  viewer: VideoViewer;
}) {
  return VideoAccessPolicy.evaluate({
    operation: 'delete',
    ownerId: input.existingVideo.ownerId,
    viewer: input.viewer,
    visibility: input.existingVideo.visibility,
  }).allowed;
}

export class DeleteLibraryVideoUseCase {
  constructor(
    private readonly deps: DeleteLibraryVideoUseCaseDependencies,
  ) {}

  async execute(input: DeleteLibraryVideoInput): Promise<DeleteLibraryVideoUseCaseResult> {
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

    const existingVideo = await this.deps.videoMutation.findOwnedLibraryVideoById({
      ownerId: input.viewer.userId,
      videoId,
    });

    if (!existingVideo) {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    if (!canDeleteVideo({ existingVideo, viewer: input.viewer })) {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    const deletionResult = await this.deps.videoMutation.deleteLibraryVideo({ videoId });

    if (!deletionResult.deleted) {
      return {
        message: 'Failed to delete video',
        ok: false,
        reason: 'DELETE_FAILED',
      };
    }

    let cleanupWarning: string | undefined;

    try {
      const cleanupResult = await this.deps.videoArtifacts.cleanupVideoArtifacts({ videoId });
      cleanupWarning = cleanupResult?.warning;
    }
    catch {
      cleanupWarning = 'Video files could not be fully removed';
    }

    return {
      data: {
        message: 'Video deleted successfully',
        title: deletionResult.title ?? existingVideo.title,
        videoId,
        warning: cleanupWarning,
      },
      ok: true,
    };
  }
}

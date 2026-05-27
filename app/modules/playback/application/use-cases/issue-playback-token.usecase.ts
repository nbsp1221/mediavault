import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import { assertValidPlaybackVideoId } from '../../domain/playback-video-id';
import { PlaybackGrantPolicy } from '../../domain/policies/PlaybackGrantPolicy';

interface IssuePlaybackTokenUseCaseDependencies {
  tokenService: PlaybackTokenService;
  videoRead: LibraryVideoReadPort;
}

interface IssuePlaybackTokenUseCaseInput {
  authenticatedUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  videoId: string;
}

type IssuePlaybackTokenUseCaseResult =
  | {
    success: true;
    token: string;
    urls: {
      clearkey: string;
      manifest: string;
    };
  }
  | {
    reason: 'SITE_SESSION_REQUIRED';
    success: false;
  }
  | {
    reason: 'VIDEO_NOT_FOUND';
    success: false;
  };

export class IssuePlaybackTokenUseCase {
  constructor(private readonly deps: IssuePlaybackTokenUseCaseDependencies) {}

  async execute(input: IssuePlaybackTokenUseCaseInput): Promise<IssuePlaybackTokenUseCaseResult> {
    assertValidPlaybackVideoId(input.videoId);

    const authenticatedUserId = input.authenticatedUserId;
    const decision = PlaybackGrantPolicy.evaluate({
      hasSiteSession: Boolean(authenticatedUserId),
    });

    if (!decision.allowed || !authenticatedUserId) {
      return {
        reason: 'SITE_SESSION_REQUIRED',
        success: false,
      };
    }

    const video = await this.deps.videoRead.findLibraryVideoById(
      input.videoId,
      createVideoReadAccessScope({
        type: 'authenticated',
        userId: authenticatedUserId,
      }),
    );

    if (!video) {
      return {
        reason: 'VIDEO_NOT_FOUND',
        success: false,
      };
    }

    const token = await this.deps.tokenService.issue({
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      userId: authenticatedUserId,
      videoId: input.videoId,
    });

    return {
      success: true,
      token,
      urls: {
        clearkey: `/videos/${input.videoId}/clearkey?token=${token}`,
        manifest: `/videos/${input.videoId}/manifest.mpd?token=${token}`,
      },
    };
  }
}

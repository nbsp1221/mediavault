import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import { assertValidPlaybackVideoId } from '../../domain/playback-video-id';

interface IssuePlaybackTokenUseCaseDependencies {
  tokenService: PlaybackTokenService;
  videoRead: LibraryVideoReadPort;
}

interface IssuePlaybackTokenUseCaseInput {
  ipAddress?: string;
  userAgent?: string;
  videoId: string;
  viewer:
    | { type: 'anonymous' }
    | { type: 'authenticated'; userId: string };
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
    reason: 'VIDEO_NOT_FOUND';
    success: false;
  };

export class IssuePlaybackTokenUseCase {
  constructor(private readonly deps: IssuePlaybackTokenUseCaseDependencies) {}

  async execute(input: IssuePlaybackTokenUseCaseInput): Promise<IssuePlaybackTokenUseCaseResult> {
    assertValidPlaybackVideoId(input.videoId);

    const video = await this.deps.videoRead.findLibraryVideoById(
      input.videoId,
      createVideoReadAccessScope(input.viewer),
    );

    if (!video) {
      return {
        reason: 'VIDEO_NOT_FOUND',
        success: false,
      };
    }

    const token = input.viewer.type === 'anonymous'
      ? await this.deps.tokenService.issue({
          ipAddress: input.ipAddress,
          readScope: 'public_only',
          userAgent: input.userAgent,
          videoId: input.videoId,
          viewerType: 'anonymous',
        })
      : await this.deps.tokenService.issue({
          ipAddress: input.ipAddress,
          readScope: 'public_or_owned',
          subjectUserId: input.viewer.userId,
          userAgent: input.userAgent,
          videoId: input.videoId,
          viewerType: 'authenticated',
        });

    return {
      success: true,
      token,
      urls: {
        clearkey: `/videos/${input.videoId}/clearkey`,
        manifest: `/videos/${input.videoId}/manifest.mpd`,
      },
    };
  }
}

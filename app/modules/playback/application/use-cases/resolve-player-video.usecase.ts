import type { VideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { VideoCatalogPort } from '../ports/video-catalog.port';

interface ResolvePlayerVideoUseCaseDependencies {
  videoCatalog: VideoCatalogPort;
}

interface ResolvePlayerVideoUseCaseInput {
  readScope: VideoReadAccessScope;
  videoId: string;
}

type ResolvePlayerVideoUseCaseResult =
  | {
    ok: true;
    relatedVideos: Awaited<ReturnType<VideoCatalogPort['getPlayerVideo']>> extends infer TResult
      ? TResult extends { relatedVideos: infer TRelated }
        ? TRelated
        : never
      : never;
    video: Awaited<ReturnType<VideoCatalogPort['getPlayerVideo']>> extends infer TResult
      ? TResult extends { video: infer TVideo }
        ? TVideo
        : never
      : never;
  }
  | {
    ok: false;
    reason: 'VIDEO_NOT_FOUND';
  };

export class ResolvePlayerVideoUseCase {
  constructor(private readonly deps: ResolvePlayerVideoUseCaseDependencies) {}

  async execute(input: ResolvePlayerVideoUseCaseInput): Promise<ResolvePlayerVideoUseCaseResult> {
    const result = await this.deps.videoCatalog.getPlayerVideo(
      input.videoId,
      input.readScope,
    );

    if (!result) {
      return {
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    return {
      ok: true,
      relatedVideos: result.relatedVideos,
      video: result.video,
    };
  }
}

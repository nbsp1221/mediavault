import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type {
  PlaybackMediaSegmentService,
  PlaybackMediaType,
} from '../ports/playback-media-segment-service.port';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import {
  type PlaybackResourceReadAuthorizationResult,
  authorizePlaybackResourceRead,
} from './authorize-playback-resource-read';

interface ServePlaybackMediaSegmentUseCaseDependencies {
  mediaSegmentService: PlaybackMediaSegmentService;
  tokenService: PlaybackTokenService;
  videoRead: LibraryVideoReadPort;
}

interface ServePlaybackMediaSegmentUseCaseInput {
  filename: string;
  mediaType: PlaybackMediaType;
  rangeHeader: string | null;
  token: string | null;
  userId: string;
  videoId: string;
}

type ServePlaybackMediaSegmentUseCaseResult =
  | {
    headers: Record<string, string>;
    isRangeResponse: boolean;
    ok: true;
    statusCode?: number;
    stream: ReadableStream;
  }
  | Exclude<PlaybackResourceReadAuthorizationResult<'audio-segment' | 'segment'>, { ok: true }>;

export class ServePlaybackMediaSegmentUseCase {
  constructor(private readonly deps: ServePlaybackMediaSegmentUseCaseDependencies) {}

  async execute(input: ServePlaybackMediaSegmentUseCaseInput): Promise<ServePlaybackMediaSegmentUseCaseResult> {
    const resource = input.mediaType === 'audio' ? 'audio-segment' : 'segment';
    const authorization = await authorizePlaybackResourceRead({
      resource,
      token: input.token,
      tokenService: this.deps.tokenService,
      userId: input.userId,
      videoId: input.videoId,
      videoRead: this.deps.videoRead,
    });

    if (!authorization.ok) {
      return authorization;
    }

    const segment = await this.deps.mediaSegmentService.serveSegment({
      filename: input.filename,
      mediaType: input.mediaType,
      rangeHeader: input.rangeHeader,
      videoId: input.videoId,
    });

    return {
      headers: segment.headers,
      isRangeResponse: segment.isRangeResponse,
      ok: true,
      statusCode: segment.statusCode,
      stream: segment.stream,
    };
  }
}

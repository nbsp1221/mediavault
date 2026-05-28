import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { PlaybackManifestService } from '../ports/playback-manifest-service.port';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import {
  type PlaybackResourceReadAuthorizationResult,
  authorizePlaybackResourceRead,
} from './authorize-playback-resource-read';

interface ServePlaybackManifestUseCaseDependencies {
  manifestService: PlaybackManifestService;
  tokenService: PlaybackTokenService;
  videoRead: LibraryVideoReadPort;
}

interface ServePlaybackManifestUseCaseInput {
  token: string | null;
  videoId: string;
}

type ServePlaybackManifestUseCaseResult =
  | {
    body: string;
    headers: Record<string, string>;
    ok: true;
  }
  | Exclude<PlaybackResourceReadAuthorizationResult<'manifest'>, { ok: true }>;

export class ServePlaybackManifestUseCase {
  constructor(private readonly deps: ServePlaybackManifestUseCaseDependencies) {}

  async execute(input: ServePlaybackManifestUseCaseInput): Promise<ServePlaybackManifestUseCaseResult> {
    const authorization = await authorizePlaybackResourceRead({
      resource: 'manifest',
      token: input.token,
      tokenService: this.deps.tokenService,
      videoId: input.videoId,
      videoRead: this.deps.videoRead,
    });

    if (!authorization.ok) {
      return authorization;
    }

    const manifest = await this.deps.manifestService.getManifest({
      videoId: input.videoId,
    });

    return {
      body: manifest.body,
      headers: manifest.headers,
      ok: true,
    };
  }
}

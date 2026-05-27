import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { PlaybackClearKeyService } from '../ports/playback-clearkey-service.port';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import {
  type PlaybackResourceReadAuthorizationResult,
  authorizePlaybackResourceRead,
} from './authorize-playback-resource-read';

interface ServePlaybackClearKeyLicenseUseCaseDependencies {
  clearKeyService: PlaybackClearKeyService;
  tokenService: PlaybackTokenService;
  videoRead: LibraryVideoReadPort;
}

interface ServePlaybackClearKeyLicenseUseCaseInput {
  token: string | null;
  userId: string;
  videoId: string;
}

type ServePlaybackClearKeyLicenseUseCaseResult =
  | {
    body: string;
    headers: Record<string, string>;
    ok: true;
  }
  | Exclude<PlaybackResourceReadAuthorizationResult<'clearkey-license'>, { ok: true }>;

export class ServePlaybackClearKeyLicenseUseCase {
  constructor(private readonly deps: ServePlaybackClearKeyLicenseUseCaseDependencies) {}

  async execute(input: ServePlaybackClearKeyLicenseUseCaseInput): Promise<ServePlaybackClearKeyLicenseUseCaseResult> {
    const authorization = await authorizePlaybackResourceRead({
      resource: 'clearkey-license',
      token: input.token,
      tokenService: this.deps.tokenService,
      userId: input.userId,
      videoId: input.videoId,
      videoRead: this.deps.videoRead,
    });

    if (!authorization.ok) {
      return authorization;
    }

    const license = await this.deps.clearKeyService.serveLicense({
      videoId: input.videoId,
    });

    return {
      body: license.body,
      headers: license.headers,
      ok: true,
    };
  }
}

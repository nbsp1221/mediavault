import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { PlaybackClearKeyService as PlaybackClearKeyServicePort } from '~/modules/playback/application/ports/playback-clearkey-service.port';
import type { PlaybackManifestService as PlaybackManifestServicePort } from '~/modules/playback/application/ports/playback-manifest-service.port';
import type { PlaybackMediaSegmentService as PlaybackMediaSegmentServicePort } from '~/modules/playback/application/ports/playback-media-segment-service.port';
import type { PlaybackTokenService as PlaybackTokenServicePort } from '~/modules/playback/application/ports/playback-token-service.port';
import type { VideoCatalogPort } from '~/modules/playback/application/ports/video-catalog.port';
import { SqliteCanonicalVideoMetadataAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter';
import { IssuePlaybackTokenUseCase } from '~/modules/playback/application/use-cases/issue-playback-token.usecase';
import { ResolvePlayerVideoUseCase } from '~/modules/playback/application/use-cases/resolve-player-video.usecase';
import { ServePlaybackClearKeyLicenseUseCase } from '~/modules/playback/application/use-cases/serve-playback-clearkey-license.usecase';
import { ServePlaybackManifestUseCase } from '~/modules/playback/application/use-cases/serve-playback-manifest.usecase';
import { ServePlaybackMediaSegmentUseCase } from '~/modules/playback/application/use-cases/serve-playback-media-segment.usecase';
import { PlaybackVideoCatalogAdapter } from '~/modules/playback/infrastructure/catalog/playback-video-catalog.adapter';
import { PlaybackClearKeyService } from '~/modules/playback/infrastructure/license/playback-clearkey.service';
import { PlaybackManifestService } from '~/modules/playback/infrastructure/media/playback-manifest.service';
import { PlaybackMediaSegmentService } from '~/modules/playback/infrastructure/media/playback-media-segment.service';
import { JsonWebTokenPlaybackTokenService } from '~/modules/playback/infrastructure/token/jsonwebtoken-playback-token.service';

interface ServerPlaybackServices {
  issuePlaybackToken: IssuePlaybackTokenUseCase;
  resolvePlayerVideo: ResolvePlayerVideoUseCase;
  servePlaybackClearKeyLicense: ServePlaybackClearKeyLicenseUseCase;
  servePlaybackManifest: ServePlaybackManifestUseCase;
  servePlaybackMediaSegment: ServePlaybackMediaSegmentUseCase;
}

interface ServerPlaybackServiceDependencies {
  clearKeyService: PlaybackClearKeyServicePort;
  manifestService: PlaybackManifestServicePort;
  mediaSegmentService: PlaybackMediaSegmentServicePort;
  tokenService: PlaybackTokenServicePort;
  videoRead: LibraryVideoReadPort;
  videoCatalog: VideoCatalogPort;
}

let cachedPlaybackServices: ServerPlaybackServices | null = null;

function createLazyValue<T>(factory: () => T): () => T {
  const uninitialized = Symbol('uninitialized');
  let cachedValue: T | typeof uninitialized = uninitialized;

  return () => {
    if (cachedValue !== uninitialized) {
      return cachedValue;
    }

    cachedValue = factory();
    return cachedValue;
  };
}

export function createServerPlaybackServices(
  overrides: Partial<ServerPlaybackServiceDependencies> = {},
): ServerPlaybackServices {
  const getClearKeyService = createLazyValue(() => overrides.clearKeyService ?? new PlaybackClearKeyService());
  const getManifestService = createLazyValue(() => overrides.manifestService ?? new PlaybackManifestService());
  const getMediaSegmentService = createLazyValue(() => overrides.mediaSegmentService ?? new PlaybackMediaSegmentService());
  const getTokenService = createLazyValue(() => overrides.tokenService ?? new JsonWebTokenPlaybackTokenService());
  const getVideoCatalog = createLazyValue(() => overrides.videoCatalog ?? new PlaybackVideoCatalogAdapter());
  const getVideoRead = createLazyValue(() => overrides.videoRead ?? new SqliteCanonicalVideoMetadataAdapter());
  const getIssuePlaybackToken = createLazyValue(() => new IssuePlaybackTokenUseCase({
    tokenService: getTokenService(),
    videoRead: getVideoRead(),
  }));
  const getResolvePlayerVideo = createLazyValue(() => new ResolvePlayerVideoUseCase({
    videoCatalog: getVideoCatalog(),
  }));
  const getServePlaybackClearKeyLicense = createLazyValue(() => new ServePlaybackClearKeyLicenseUseCase({
    clearKeyService: getClearKeyService(),
    tokenService: getTokenService(),
    videoRead: getVideoRead(),
  }));
  const getServePlaybackManifest = createLazyValue(() => new ServePlaybackManifestUseCase({
    manifestService: getManifestService(),
    tokenService: getTokenService(),
    videoRead: getVideoRead(),
  }));
  const getServePlaybackMediaSegment = createLazyValue(() => new ServePlaybackMediaSegmentUseCase({
    mediaSegmentService: getMediaSegmentService(),
    tokenService: getTokenService(),
    videoRead: getVideoRead(),
  }));

  return {
    get issuePlaybackToken() {
      return getIssuePlaybackToken();
    },
    get resolvePlayerVideo() {
      return getResolvePlayerVideo();
    },
    get servePlaybackClearKeyLicense() {
      return getServePlaybackClearKeyLicense();
    },
    get servePlaybackManifest() {
      return getServePlaybackManifest();
    },
    get servePlaybackMediaSegment() {
      return getServePlaybackMediaSegment();
    },
  };
}

export function getServerPlaybackServices(): ServerPlaybackServices {
  if (cachedPlaybackServices) {
    return cachedPlaybackServices;
  }

  cachedPlaybackServices = createServerPlaybackServices();

  return cachedPlaybackServices;
}

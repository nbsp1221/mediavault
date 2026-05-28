import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import type { PlaybackTokenPayload } from '../ports/playback-token-service.port';
import {
  type PlaybackResource,
  PlaybackResourcePolicy,
} from '../../domain/policies/PlaybackResourcePolicy';

interface AuthorizePlaybackResourceReadInput<Resource extends PlaybackResource> {
  resource: Resource;
  token: string | null;
  tokenService: PlaybackTokenService;
  videoId: string;
  videoRead: LibraryVideoReadPort;
}

export type PlaybackResourceReadAuthorizationResult<Resource extends PlaybackResource> =
  | { ok: true }
  | {
    metadata: {
      requestedVideoId: string;
      resource: Resource;
      tokenVideoId?: string;
    };
    ok: false;
    reason: 'PLAYBACK_TOKEN_REQUIRED' | 'VIDEO_SCOPE_MISMATCH';
  }
  | {
    metadata: {
      requestedVideoId: string;
      resource: Resource;
    };
    ok: false;
    reason: 'VIDEO_NOT_FOUND';
  };

export async function authorizePlaybackResourceRead<Resource extends PlaybackResource>({
  resource,
  token,
  tokenService,
  videoId,
  videoRead,
}: AuthorizePlaybackResourceReadInput<Resource>): Promise<PlaybackResourceReadAuthorizationResult<Resource>> {
  const payload = token
    ? await tokenService.validate(token)
    : null;
  const decision = PlaybackResourcePolicy.evaluate({
    requestedVideoId: videoId,
    resource,
    token: payload,
  });

  if (!decision.allowed) {
    return {
      metadata: {
        ...decision.metadata,
        resource,
      },
      ok: false,
      reason: decision.reason,
    };
  }

  if (!payload) {
    return {
      metadata: {
        requestedVideoId: videoId,
        resource,
      },
      ok: false,
      reason: 'PLAYBACK_TOKEN_REQUIRED',
    };
  }

  const accessibleVideo = await videoRead.findLibraryVideoById(videoId, createVideoReadAccessScope(createTokenViewer(payload)));

  if (!accessibleVideo) {
    return {
      metadata: {
        requestedVideoId: videoId,
        resource,
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    };
  }

  return { ok: true };
}

function createTokenViewer(payload: PlaybackTokenPayload) {
  if (payload.viewerType === 'anonymous') {
    return { type: 'anonymous' as const };
  }

  return {
    type: 'authenticated' as const,
    userId: payload.subjectUserId,
  };
}

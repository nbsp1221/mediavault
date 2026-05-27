import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import type { PlaybackTokenService } from '../ports/playback-token-service.port';
import {
  type PlaybackResource,
  PlaybackResourcePolicy,
} from '../../domain/policies/PlaybackResourcePolicy';

interface AuthorizePlaybackResourceReadInput<Resource extends PlaybackResource> {
  resource: Resource;
  token: string | null;
  tokenService: PlaybackTokenService;
  userId: string;
  videoId: string;
  videoRead: LibraryVideoReadPort;
}

export type PlaybackResourceReadAuthorizationResult<Resource extends PlaybackResource> =
  | { ok: true }
  | {
    metadata: {
      requestedVideoId: string;
      resource: Resource;
      requestedUserId?: string;
      tokenVideoId?: string;
      tokenUserId?: string;
    };
    ok: false;
    reason: 'PLAYBACK_TOKEN_REQUIRED' | 'USER_SCOPE_MISMATCH' | 'VIDEO_SCOPE_MISMATCH';
  }
  | {
    metadata: {
      requestedUserId: string;
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
  userId,
  videoId,
  videoRead,
}: AuthorizePlaybackResourceReadInput<Resource>): Promise<PlaybackResourceReadAuthorizationResult<Resource>> {
  const payload = token
    ? await tokenService.validate(token)
    : null;
  const decision = PlaybackResourcePolicy.evaluate({
    requestedVideoId: videoId,
    requestedUserId: userId,
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

  const accessibleVideo = await videoRead.findLibraryVideoById(videoId, createVideoReadAccessScope({
    type: 'authenticated',
    userId,
  }));

  if (!accessibleVideo) {
    return {
      metadata: {
        requestedUserId: userId,
        requestedVideoId: videoId,
        resource,
      },
      ok: false,
      reason: 'VIDEO_NOT_FOUND',
    };
  }

  return { ok: true };
}

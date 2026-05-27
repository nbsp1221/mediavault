export type PlaybackResource =
  | 'manifest'
  | 'segment'
  | 'audio-segment'
  | 'clearkey-license';

export interface PlaybackTokenScope {
  userId?: string;
  videoId: string;
}

export type PlaybackResourceDecision =
  | {
    allowed: true;
    resource: PlaybackResource;
  }
  | {
    allowed: false;
    reason: 'PLAYBACK_TOKEN_REQUIRED' | 'USER_SCOPE_MISMATCH' | 'VIDEO_SCOPE_MISMATCH';
    metadata: {
      requestedVideoId: string;
      resource: PlaybackResource;
      requestedUserId?: string;
      tokenVideoId?: string;
      tokenUserId?: string;
    };
  };

interface PlaybackResourcePolicyInput {
  requestedVideoId: string;
  requestedUserId: string;
  resource: PlaybackResource;
  token: PlaybackTokenScope | null;
}

export class PlaybackResourcePolicy {
  static evaluate(input: PlaybackResourcePolicyInput): PlaybackResourceDecision {
    if (!input.token) {
      return {
        allowed: false,
        metadata: {
          requestedVideoId: input.requestedVideoId,
          requestedUserId: input.requestedUserId,
          resource: input.resource,
        },
        reason: 'PLAYBACK_TOKEN_REQUIRED',
      };
    }

    if (input.token.videoId !== input.requestedVideoId) {
      return {
        allowed: false,
        metadata: {
          requestedVideoId: input.requestedVideoId,
          requestedUserId: input.requestedUserId,
          resource: input.resource,
          tokenVideoId: input.token.videoId,
          tokenUserId: input.token.userId,
        },
        reason: 'VIDEO_SCOPE_MISMATCH',
      };
    }

    if (input.token.userId !== input.requestedUserId) {
      return {
        allowed: false,
        metadata: {
          requestedVideoId: input.requestedVideoId,
          requestedUserId: input.requestedUserId,
          resource: input.resource,
          tokenUserId: input.token.userId,
        },
        reason: 'USER_SCOPE_MISMATCH',
      };
    }

    return {
      allowed: true,
      resource: input.resource,
    };
  }
}

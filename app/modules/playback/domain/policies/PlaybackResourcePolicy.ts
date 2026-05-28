export type PlaybackResource =
  | 'manifest'
  | 'segment'
  | 'audio-segment'
  | 'clearkey-license';

export interface PlaybackTokenScope {
  readScope: 'public_only' | 'public_or_owned';
  subjectUserId?: string;
  videoId: string;
  viewerType: 'anonymous' | 'authenticated';
}

export type PlaybackResourceDecision =
  | {
    allowed: true;
    resource: PlaybackResource;
  }
  | {
    allowed: false;
    reason: 'PLAYBACK_TOKEN_REQUIRED' | 'VIDEO_SCOPE_MISMATCH';
    metadata: {
      requestedVideoId: string;
      resource: PlaybackResource;
      tokenVideoId?: string;
    };
  };

interface PlaybackResourcePolicyInput {
  requestedVideoId: string;
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
          resource: input.resource,
          tokenVideoId: input.token.videoId,
        },
        reason: 'VIDEO_SCOPE_MISMATCH',
      };
    }

    return {
      allowed: true,
      resource: input.resource,
    };
  }
}

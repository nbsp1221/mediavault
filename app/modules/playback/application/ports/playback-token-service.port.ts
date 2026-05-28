interface PlaybackTokenPayloadBase {
  ipAddress?: string;
  jti: string;
  userAgent?: string;
  videoId: string;
}

export type PlaybackTokenPayload = PlaybackTokenPayloadBase & (
  | {
    readScope: 'public_only';
    subjectUserId?: never;
    viewerType: 'anonymous';
  }
  | {
    readScope: 'public_or_owned';
    subjectUserId: string;
    viewerType: 'authenticated';
  }
);

interface PlaybackTokenIssueInputBase {
  ipAddress?: string;
  userAgent?: string;
  videoId: string;
}

export type PlaybackTokenIssueInput = PlaybackTokenIssueInputBase & (
  | {
    readScope: 'public_only';
    subjectUserId?: never;
    viewerType: 'anonymous';
  }
  | {
    readScope: 'public_or_owned';
    subjectUserId: string;
    viewerType: 'authenticated';
  }
);

export interface PlaybackTokenService {
  issue: (input: PlaybackTokenIssueInput) => Promise<string>;
  validate: (token: string) => Promise<PlaybackTokenPayload | null>;
}

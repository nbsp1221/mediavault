export interface PlaybackTokenPayload {
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  videoId: string;
}

export interface PlaybackTokenIssueInput {
  ipAddress?: string;
  userAgent?: string;
  userId: string;
  videoId: string;
}

export interface PlaybackTokenService {
  issue: (input: PlaybackTokenIssueInput) => Promise<string>;
  validate: (token: string) => Promise<PlaybackTokenPayload | null>;
}

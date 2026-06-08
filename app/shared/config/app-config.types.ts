import type { SignOptions } from 'jsonwebtoken';

export type RuntimeEnvInput = Record<string, string | undefined>;
export type RuntimeMode = 'development' | 'production' | 'test';
export type AdminApiMode = 'always' | 'bootstrap' | 'disabled';

export interface AdminApiConfig {
  readonly mode: AdminApiMode;
  readonly token: string | null;
}

export interface AuthConfig {
  readonly failedLoginBlockDurationMs: number;
  readonly failedLoginDelayMs: number;
  readonly failedLoginWindowMs: number;
  readonly maxFailedLoginAttempts: number;
  readonly sessionCookieName: string;
  readonly sessionCookiePath: string;
  readonly sessionCookieSecure: boolean;
  readonly sessionTtlMs: number;
  readonly trustProxyHeaders: boolean;
}

export interface AuthCookieConfig {
  readonly clientCookieName: string;
  readonly sessionCookieName: string;
  readonly sessionCookiePath: string;
  readonly sessionCookieSecure: boolean;
  readonly sessionTtlMs: number;
}

export interface AuthClientIdentityConfig extends AuthCookieConfig {
  readonly clientCookieSigningSecret: string;
}

export interface AuthRateLimitConfig {
  readonly trustProxyHeaders: boolean;
}

export interface MediaKeyDerivationConfig {
  readonly masterSeed: string;
  readonly saltPrefix: string;
}

export interface MediaPackagingConfig {
  readonly segmentDuration: number;
}

export interface PlaybackConfig {
  readonly jwtAudience: string;
  readonly jwtExpiry: SignOptions['expiresIn'];
  readonly jwtIssuer: string;
  readonly jwtSecret: string;
}

export interface PrimaryStorageConfig {
  readonly databaseEncryptionKey: string;
  readonly databasePath: string;
  readonly stagingDir: string;
  readonly stagingTempDir: string;
  readonly storageDir: string;
  readonly videosDir: string;
}

export interface StoragePaths {
  readonly stagingDir: string;
  readonly stagingTempDir: string;
  readonly storageDir: string;
  readonly videosDir: string;
}

export interface VideoToolOverridesConfig {
  readonly ffmpegPath: string | undefined;
  readonly ffprobePath: string | undefined;
  readonly shakaPackagerPath: string | undefined;
}

export interface RuntimeConfig {
  readonly isProductionRuntime: boolean;
  readonly nodeEnv: RuntimeMode | undefined;
}

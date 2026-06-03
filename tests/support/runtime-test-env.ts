import { collectCriticalProductionSecretIssues } from '../../app/modules/runtime/application/production-readiness.policy';
import {
  getAdminApiConfigFromEnv,
  getAuthClientIdentityConfigFromEnv,
  getMediaKeyDerivationConfigFromEnv,
  getPlaybackConfigFromEnv,
  getPrimaryStorageConfigFromEnv,
} from '../../app/shared/config/app-config.server';
import { PUBLIC_ENV_KEYS } from '../../app/shared/config/public-env.server';
import { HERMETIC_TEST_ENV } from '../../scripts/hermetic-env';
import { TEST_DATABASE_ENCRYPTION_KEY } from './database-encryption-key';

export type RuntimeTestEnv = Record<string, string>;
export type RuntimeTestEnvInput = Record<string, string | undefined>;
export type RuntimeTestEnvOverrides = Record<string, string | undefined>;

export const RUNTIME_TEST_SECRETS = {
  authClientCookieSecret: 'smoke-auth-client-cookie-secret-012345',
  databaseEncryptionKey: TEST_DATABASE_ENCRYPTION_KEY,
  mediaKeyDerivationSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  playbackJwtSecret: 'smoke-video-jwt-secret-0123456789abcdef',
} as const;

const FORWARDED_ENV_KEYS = [
  'CI',
  'FORCE_COLOR',
  'GITHUB_ACTIONS',
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'TZ',
] as const;

function createBaseRuntimeTestEnv(): RuntimeTestEnv {
  return {
    ...HERMETIC_TEST_ENV,
    [PUBLIC_ENV_KEYS.authClientCookieSecret]: RUNTIME_TEST_SECRETS.authClientCookieSecret,
    [PUBLIC_ENV_KEYS.databaseEncryptionKey]: RUNTIME_TEST_SECRETS.databaseEncryptionKey,
    [PUBLIC_ENV_KEYS.playbackJwtSecret]: RUNTIME_TEST_SECRETS.playbackJwtSecret,
    [PUBLIC_ENV_KEYS.mediaKeyDerivationSecret]: RUNTIME_TEST_SECRETS.mediaKeyDerivationSecret,
  };
}

export function createRuntimeTestEnv(
  overrides: Record<string, string> = {},
): RuntimeTestEnv {
  const forwardedEnv = Object.fromEntries(
    FORWARDED_ENV_KEYS.flatMap((key) => {
      const value = process.env[key];
      return value ? [[key, value]] : [];
    }),
  );

  return {
    ...forwardedEnv,
    ...createBaseRuntimeTestEnv(),
    ...overrides,
  };
}

function applyRuntimeEnvOverrides(
  env: RuntimeTestEnv,
  overrides: RuntimeTestEnvOverrides,
): RuntimeTestEnvInput {
  return {
    ...env,
    ...overrides,
  };
}

export function createProductionRuntimeTestEnv(
  overrides: RuntimeTestEnvOverrides = {},
): RuntimeTestEnvInput {
  return applyRuntimeEnvOverrides(createRuntimeTestEnv(), {
    [PUBLIC_ENV_KEYS.nodeEnv]: 'production',
    ...overrides,
  });
}

export function createDockerComposeRuntimeTestEnv(
  overrides: RuntimeTestEnvOverrides = {},
): RuntimeTestEnvInput {
  return {
    ...createBaseRuntimeTestEnv(),
    [PUBLIC_ENV_KEYS.nodeEnv]: 'production',
    [PUBLIC_ENV_KEYS.adminApiMode]: 'bootstrap',
    [PUBLIC_ENV_KEYS.adminApiToken]: 'compose-test-admin-token-012345',
    PORT: '3000',
    [PUBLIC_ENV_KEYS.storageDir]: '/app/storage',
    ...overrides,
  };
}

export function withDockerContainerRuntimeEnv(
  env: RuntimeTestEnvInput,
  overrides: RuntimeTestEnvOverrides = {},
): RuntimeTestEnvInput {
  return {
    ...env,
    [PUBLIC_ENV_KEYS.adminApiMode]: 'bootstrap',
    [PUBLIC_ENV_KEYS.adminApiToken]: 'compose-test-admin-token-012345',
    PORT: '3000',
    [PUBLIC_ENV_KEYS.storageDir]: '/app/storage',
    ...overrides,
  };
}

export function withoutRuntimeEnvKey(env: RuntimeTestEnvInput, key: string): RuntimeTestEnvInput {
  return {
    ...env,
    [key]: undefined,
  };
}

export function runtimeSecretLogValues(env: RuntimeTestEnvInput): string[] {
  return [
    env[PUBLIC_ENV_KEYS.databaseEncryptionKey],
    env[PUBLIC_ENV_KEYS.adminApiToken],
    env[PUBLIC_ENV_KEYS.playbackJwtSecret],
    env[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret],
    env[PUBLIC_ENV_KEYS.authClientCookieSecret],
  ].flatMap(value => (value ? [value] : []));
}

export function assertRuntimeTestEnvConfigurable(env: RuntimeTestEnvInput): void {
  getPlaybackConfigFromEnv(env);
  getAdminApiConfigFromEnv(env);
  getAuthClientIdentityConfigFromEnv(env);
  getMediaKeyDerivationConfigFromEnv(env);
  getPrimaryStorageConfigFromEnv(env);

  const issues = collectCriticalProductionSecretIssues(env);
  if (issues.length > 0) {
    throw new Error(issues.map(issue => issue.message).join('\n'));
  }
}

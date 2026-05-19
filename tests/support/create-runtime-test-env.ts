import { TEST_DATABASE_ENCRYPTION_KEY } from './database-encryption-key';

const SMOKE_MEDIAVAULT_PLAYBACK_JWT_SECRET = 'smoke-video-jwt-secret';
const SMOKE_MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

type RuntimeTestEnvOverrides = Record<string, string>;

export function createRuntimeTestEnv(
  overrides: RuntimeTestEnvOverrides = {},
): Record<string, string> {
  const forwardedEnv = Object.fromEntries(
    FORWARDED_ENV_KEYS.flatMap((key) => {
      const value = process.env[key];
      return value ? [[key, value]] : [];
    }),
  );

  return {
    ...forwardedEnv,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    LOCAL_STREAMER_DISABLE_VITE_ENV_FILES: 'true',
    MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS: '1',
    MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET: 'smoke-auth-client-cookie-secret',
    MEDIAVAULT_DATABASE_ENCRYPTION_KEY: TEST_DATABASE_ENCRYPTION_KEY,
    TZ: 'Etc/UTC',
    MEDIAVAULT_PLAYBACK_JWT_SECRET: SMOKE_MEDIAVAULT_PLAYBACK_JWT_SECRET,
    MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: SMOKE_MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET,
    ...overrides,
  };
}

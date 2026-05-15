const SMOKE_VIDEO_JWT_SECRET = 'smoke-video-jwt-secret';
const SMOKE_VIDEO_MASTER_ENCRYPTION_SEED =
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
    AUTH_FAILED_LOGIN_DELAY_MS: '1',
    TZ: 'Etc/UTC',
    VIDEO_JWT_SECRET: SMOKE_VIDEO_JWT_SECRET,
    VIDEO_MASTER_ENCRYPTION_SEED: SMOKE_VIDEO_MASTER_ENCRYPTION_SEED,
    ...overrides,
  };
}

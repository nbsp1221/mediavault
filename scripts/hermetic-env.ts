import { MEDIAVAULT_DISABLE_VITE_ENV_FILES } from './vite-env-files';

export const HERMETIC_TEST_ENV = {
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  MEDIAVAULT_AUTH_FAILED_LOGIN_DELAY_MS: '1',
  [MEDIAVAULT_DISABLE_VITE_ENV_FILES]: 'true',
  TZ: 'Etc/UTC',
} as const;

export function createHermeticTestEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    ...HERMETIC_TEST_ENV,
    ...overrides,
  };
}

export function applyHermeticTestEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const hermeticEnv = createHermeticTestEnv(env, overrides);

  for (const [key, value] of Object.entries(hermeticEnv)) {
    if (value === undefined) {
      delete env[key];
    }
    else {
      env[key] = value;
    }
  }

  return env;
}

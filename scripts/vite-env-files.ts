export const MEDIAVAULT_DISABLE_VITE_ENV_FILES = 'MEDIAVAULT_DISABLE_VITE_ENV_FILES';

export function resolveViteEnvDir(env: NodeJS.ProcessEnv): string | false | undefined {
  return env[MEDIAVAULT_DISABLE_VITE_ENV_FILES] === 'true' ? false : undefined;
}

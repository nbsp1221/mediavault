import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';

export type AdminApiMode = 'always' | 'bootstrap' | 'disabled';

export interface AdminApiConfig {
  mode: AdminApiMode;
  token: string | null;
}

export type AdminApiConfigEnvironment = Record<string, string | undefined>;

const ADMIN_API_MODES = new Set<AdminApiMode>([
  'always',
  'bootstrap',
  'disabled',
]);

export function getAdminApiConfig(env: AdminApiConfigEnvironment = process.env): AdminApiConfig {
  const rawMode = env[PUBLIC_ENV_KEYS.adminApiMode]?.trim() || 'disabled';

  if (!ADMIN_API_MODES.has(rawMode as AdminApiMode)) {
    throw new Error(`Invalid ${PUBLIC_ENV_KEYS.adminApiMode}. Expected disabled, bootstrap, or always.`);
  }

  return {
    mode: rawMode as AdminApiMode,
    token: env[PUBLIC_ENV_KEYS.adminApiToken]?.trim() || null,
  };
}

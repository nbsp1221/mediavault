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
  const rawMode = env.MEDIAVAULT_ADMIN_API_MODE?.trim() || 'disabled';

  if (!ADMIN_API_MODES.has(rawMode as AdminApiMode)) {
    throw new Error('Invalid MEDIAVAULT_ADMIN_API_MODE. Expected disabled, bootstrap, or always.');
  }

  return {
    mode: rawMode as AdminApiMode,
    token: env.MEDIAVAULT_ADMIN_TOKEN?.trim() || null,
  };
}

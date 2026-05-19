import type { RuntimeEnvInput } from './runtime-env.server';
import {
  type AdminApiConfig,
  getAdminApiConfigFromEnv,
} from './app-config.server';

export type {
  AdminApiConfig,
  AdminApiMode,
} from './app-config.server';

export function getAdminApiConfig(env?: RuntimeEnvInput): AdminApiConfig {
  return getAdminApiConfigFromEnv(env ?? process.env);
}

import type { RuntimeEnvInput } from './runtime-env.server';
import {
  type MediaKeyDerivationConfig,
  type MediaPackagingConfig,
  getMediaKeyDerivationConfigFromEnv,
  getMediaPackagingConfigFromEnv,
} from './app-config.server';

export type {
  MediaKeyDerivationConfig,
  MediaPackagingConfig,
} from './app-config.server';

export function getMediaKeyDerivationConfig(env?: RuntimeEnvInput): MediaKeyDerivationConfig {
  return getMediaKeyDerivationConfigFromEnv(env ?? process.env);
}

export function getMediaPackagingConfig(env?: RuntimeEnvInput): MediaPackagingConfig {
  return getMediaPackagingConfigFromEnv(env ?? process.env);
}

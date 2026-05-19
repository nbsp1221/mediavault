import type { RuntimeEnvInput } from './runtime-env.server';
import {
  type PlaybackConfig,
  getPlaybackConfigFromEnv,
} from './app-config.server';

export type { PlaybackConfig } from './app-config.server';

export function getPlaybackConfig(env?: RuntimeEnvInput): PlaybackConfig {
  return getPlaybackConfigFromEnv(env ?? process.env);
}

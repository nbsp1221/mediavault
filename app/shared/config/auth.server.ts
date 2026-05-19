import type { RuntimeEnvInput } from './runtime-env.server';
import {
  type AuthClientIdentityConfig,
  type AuthConfig,
  type AuthCookieConfig,
  type AuthRateLimitConfig,
  getAuthClientIdentityConfigFromEnv,
  getAuthConfigFromEnv,
  getAuthCookieConfigFromEnv,
  getAuthRateLimitConfigFromEnv,
} from './app-config.server';

export type {
  AuthClientIdentityConfig,
  AuthConfig,
  AuthCookieConfig,
  AuthRateLimitConfig,
} from './app-config.server';

export function getAuthCookieConfig(env?: RuntimeEnvInput): AuthCookieConfig {
  return getAuthCookieConfigFromEnv(env ?? process.env);
}

export function getAuthClientIdentityConfig(env?: RuntimeEnvInput): AuthClientIdentityConfig {
  return getAuthClientIdentityConfigFromEnv(env ?? process.env);
}

export function getAuthRateLimitConfig(env?: RuntimeEnvInput): AuthRateLimitConfig {
  return getAuthRateLimitConfigFromEnv(env ?? process.env);
}

export function getAuthConfig(env?: RuntimeEnvInput): AuthConfig {
  return getAuthConfigFromEnv(env ?? process.env);
}

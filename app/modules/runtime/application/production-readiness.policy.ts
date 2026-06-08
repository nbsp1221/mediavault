import { getRuntimeConfig } from '~/shared/config/app-config.server';
import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';
import {
  CRITICAL_PRODUCTION_SECRET_KEYS,
  getWeakPlaybackJwtSecretMessage,
  isWeakPlaybackJwtSecret,
} from '~/shared/config/runtime-config-contract.server';

interface AdminApiConfig {
  mode: 'always' | 'bootstrap' | 'disabled';
  token: string | null;
}

export type RuntimeEnvironment = Record<string, string | undefined>;

export type ProductionReadinessIssueCode =
  | 'database-unavailable'
  | 'media-tool-unavailable'
  | 'missing-auth-user'
  | 'missing-critical-secret'
  | 'non-production-runtime'
  | 'storage-unavailable'
  | 'weak-critical-secret';

export type ProductionReadinessIssueSeverity =
  | 'readiness-only'
  | 'startup-blocking';

export interface ProductionReadinessIssue {
  code: ProductionReadinessIssueCode;
  message: string;
  severity: ProductionReadinessIssueSeverity;
  subject: string;
}

export type StorageProbeTarget = 'database-path' | 'storage-root';

export type RuntimeMediaToolName = 'ffmpeg' | 'ffprobe' | 'packager';

export type StorageProbeResult =
  | { ok: true; target: StorageProbeTarget }
  | { ok: false; reason: string; target: StorageProbeTarget };

export type MediaToolProbeResult =
  | { ok: true; tool: RuntimeMediaToolName }
  | { ok: false; reason: string; tool: RuntimeMediaToolName };

export interface ProductionReadinessReport {
  issues: ProductionReadinessIssue[];
  ready: boolean;
  startupBlocked: boolean;
}

export function isProductionRuntime(env: RuntimeEnvironment): boolean {
  return getRuntimeConfig(env).isProductionRuntime;
}

export function collectCriticalProductionSecretIssues(
  env: RuntimeEnvironment,
): ProductionReadinessIssue[] {
  if (!isProductionRuntime(env)) {
    return [];
  }

  return CRITICAL_PRODUCTION_SECRET_KEYS.flatMap<ProductionReadinessIssue>((key) => {
    const value = env[key]?.trim();
    if (value) {
      if (key === PUBLIC_ENV_KEYS.playbackJwtSecret && isWeakPlaybackJwtSecret(value)) {
        return [{
          code: 'weak-critical-secret',
          message: `Production startup preflight failed: ${getWeakPlaybackJwtSecretMessage()}`,
          severity: 'startup-blocking',
          subject: key,
        } satisfies ProductionReadinessIssue];
      }

      return [];
    }

    return [{
      code: 'missing-critical-secret',
      message: `Production startup preflight failed: missing required env ${key}`,
      severity: 'startup-blocking',
      subject: key,
    } satisfies ProductionReadinessIssue];
  });
}

export function collectAuthAccountIssues(input: {
  adminApiConfig?: AdminApiConfig;
  authUserCount: number;
}): ProductionReadinessIssue[] {
  if (input.authUserCount > 0) {
    return [];
  }

  if (input.adminApiConfig?.mode === 'bootstrap' && input.adminApiConfig.token) {
    return [];
  }

  return [{
    code: 'missing-auth-user',
    message: `Production startup preflight failed: no auth users exist and ${PUBLIC_ENV_KEYS.adminApiMode}=bootstrap with ${PUBLIC_ENV_KEYS.adminApiToken} is not configured`,
    severity: 'startup-blocking',
    subject: 'auth_users',
  }];
}

export function classifyStorageProbeResults(
  results: StorageProbeResult[],
): ProductionReadinessIssue[] {
  return results.flatMap<ProductionReadinessIssue>((result) => {
    if (result.ok) {
      return [];
    }

    if (result.target === 'database-path') {
      return [{
        code: 'database-unavailable',
        message: 'Production startup preflight failed: primary SQLite database path is not usable',
        severity: 'startup-blocking',
        subject: 'primary_database_path',
      } satisfies ProductionReadinessIssue];
    }

    return [{
      code: 'storage-unavailable',
      message: `Production startup preflight failed: ${PUBLIC_ENV_KEYS.storageDir} is not usable`,
      severity: 'startup-blocking',
      subject: PUBLIC_ENV_KEYS.storageDir,
    } satisfies ProductionReadinessIssue];
  });
}

export function classifyMediaToolProbeResults(
  results: MediaToolProbeResult[],
): ProductionReadinessIssue[] {
  return results.flatMap<ProductionReadinessIssue>((result) => {
    if (result.ok) {
      return [];
    }

    return [{
      code: 'media-tool-unavailable',
      message: `Production readiness failed: media tool ${result.tool} is unavailable`,
      severity: 'readiness-only',
      subject: result.tool,
    } satisfies ProductionReadinessIssue];
  });
}

export function createProductionReadinessReport(
  input: { issues: ProductionReadinessIssue[] },
): ProductionReadinessReport {
  return {
    issues: input.issues,
    ready: input.issues.length === 0,
    startupBlocked: input.issues.some(issue => issue.severity === 'startup-blocking'),
  };
}

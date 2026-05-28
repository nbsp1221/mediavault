import { describe, expect, test } from 'vitest';
import {
  type MediaToolProbeResult,
  type StorageProbeResult,
  classifyMediaToolProbeResults,
  classifyStorageProbeResults,
  collectAuthAccountIssues,
  collectCriticalProductionSecretIssues,
  createProductionReadinessReport,
  isProductionRuntime,
} from './production-readiness.policy';

describe('production readiness policy', () => {
  test('uses NODE_ENV=production as the strict production trigger', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionRuntime({})).toBe(false);
  });

  test('reports all missing or blank critical production secrets without leaking values', () => {
    const issues = collectCriticalProductionSecretIssues({
      MEDIAVAULT_DATABASE_ENCRYPTION_KEY: 'secret-db-key',
      NODE_ENV: 'production',
      MEDIAVAULT_PLAYBACK_JWT_SECRET: '\n\t',
    });

    expect(issues).toHaveLength(3);
    expect(issues.map(issue => issue.code)).toEqual([
      'missing-critical-secret',
      'missing-critical-secret',
      'missing-critical-secret',
    ]);
    expect(issues.map(issue => issue.severity)).toEqual([
      'startup-blocking',
      'startup-blocking',
      'startup-blocking',
    ]);
    expect(issues.map(issue => issue.subject)).toEqual([
      'MEDIAVAULT_PLAYBACK_JWT_SECRET',
      'MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET',
      'MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET',
    ]);
    expect(issues.map(issue => issue.message).join('\n')).not.toContain('   ');
    expect(issues.map(issue => issue.message).join('\n')).not.toContain('\n\t');
  });

  test('reports weak playback JWT secrets in production without leaking values', () => {
    const issues = collectCriticalProductionSecretIssues({
      MEDIAVAULT_DATABASE_ENCRYPTION_KEY: 'a',
      NODE_ENV: 'production',
      MEDIAVAULT_PLAYBACK_JWT_SECRET: 'short',
      MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET: 'example',
      MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET: 'cookie',
    });

    expect(issues).toEqual([{
      code: 'weak-critical-secret',
      message: 'Production startup preflight failed: MEDIAVAULT_PLAYBACK_JWT_SECRET must be at least 32 characters',
      severity: 'startup-blocking',
      subject: 'MEDIAVAULT_PLAYBACK_JWT_SECRET',
    }]);
    expect(issues.map(issue => issue.message).join('\n')).not.toContain('short');
  });

  test('does not apply production startup secret failures outside production', () => {
    const issues = collectCriticalProductionSecretIssues({
      NODE_ENV: 'development',
    });

    expect(issues).toEqual([]);
  });

  test('reports a startup-blocking issue when production has no auth users', () => {
    expect(collectAuthAccountIssues({ authUserCount: 0 })).toEqual([{
      code: 'missing-auth-user',
      message: 'Production startup preflight failed: no auth users exist and MEDIAVAULT_ADMIN_API_MODE=bootstrap with MEDIAVAULT_ADMIN_API_TOKEN is not configured',
      severity: 'startup-blocking',
      subject: 'auth_users',
    }]);

    expect(collectAuthAccountIssues({ authUserCount: 1 })).toEqual([]);
  });

  test('allows zero-user startup when bootstrap admin API has a token', () => {
    expect(collectAuthAccountIssues({
      adminApiConfig: {
        mode: 'bootstrap',
        token: 'admin-token',
      },
      authUserCount: 0,
    })).toEqual([]);

    expect(collectAuthAccountIssues({
      adminApiConfig: {
        mode: 'bootstrap',
        token: null,
      },
      authUserCount: 0,
    })).toHaveLength(1);
  });

  test('classifies storage and database probe failures as startup-blocking production issues', () => {
    const results: StorageProbeResult[] = [
      { ok: true, target: 'storage-root' },
      { ok: false, reason: 'blocked regular file', target: 'database-path' },
    ];

    const issues = classifyStorageProbeResults(results);

    expect(issues).toEqual([
      {
        code: 'database-unavailable',
        message: 'Production startup preflight failed: primary SQLite database path is not usable',
        severity: 'startup-blocking',
        subject: 'primary_database_path',
      },
    ]);
  });

  test('classifies media probe failures as readiness-only production issues', () => {
    const results: MediaToolProbeResult[] = [
      { ok: true, tool: 'ffmpeg' },
      { ok: false, reason: 'ENOENT', tool: 'ffprobe' },
      { ok: false, reason: 'timed out', tool: 'packager' },
    ];

    const issues = classifyMediaToolProbeResults(results);

    expect(issues).toEqual([
      {
        code: 'media-tool-unavailable',
        message: 'Production readiness failed: media tool ffprobe is unavailable',
        severity: 'readiness-only',
        subject: 'ffprobe',
      },
      {
        code: 'media-tool-unavailable',
        message: 'Production readiness failed: media tool packager is unavailable',
        severity: 'readiness-only',
        subject: 'packager',
      },
    ]);
  });

  test('production readiness is ready only when there are no issues', () => {
    expect(createProductionReadinessReport({ issues: [] })).toEqual({
      issues: [],
      ready: true,
      startupBlocked: false,
    });

    expect(createProductionReadinessReport({
      issues: [{
        code: 'media-tool-unavailable',
        message: 'Production readiness failed: media tool ffmpeg is unavailable',
        severity: 'readiness-only',
        subject: 'ffmpeg',
      }],
    })).toMatchObject({
      ready: false,
      startupBlocked: false,
    });
  });
});

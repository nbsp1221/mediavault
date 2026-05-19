import { describe, expect, test } from 'vitest';
import type { ProductionReadinessReport } from '../../../app/modules/runtime/application/production-readiness.policy';
import { createHealthReadyLoader } from '../../../app/routes/health.ready';

function createReport(input: Partial<ProductionReadinessReport>): ProductionReadinessReport {
  return {
    issues: [],
    ready: true,
    startupBlocked: false,
    ...input,
  };
}

describe('production readiness route', () => {
  test('returns 204 with an empty body when production readiness passes', async () => {
    const loader = createHealthReadyLoader({
      checkProductionReadiness: async () => createReport({ ready: true }),
    });

    const response = await loader();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  test('returns 503 with an empty non-diagnostic body when production readiness fails', async () => {
    const secretValue = 'do-not-leak-secret-value';
    const localStoragePath = '/srv/mediavault/storage';
    const binaryPath = '/usr/local/bin/ffmpeg';
    const loader = createHealthReadyLoader({
      checkProductionReadiness: async () => createReport({
        issues: [{
          code: 'media-tool-unavailable',
          message: [
            secretValue,
            localStoragePath,
            binaryPath,
            'storage database media ffmpeg ffprobe packager',
          ].join(' '),
          severity: 'readiness-only',
          subject: 'ffmpeg',
        }],
        ready: false,
      }),
    });

    const response = await loader();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('');
    expect(body).not.toContain('MEDIAVAULT_DATABASE_ENCRYPTION_KEY');
    expect(body).not.toContain('MEDIAVAULT_PLAYBACK_JWT_SECRET');
    expect(body).not.toContain('MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET');
    expect(body).not.toContain(secretValue);
    expect(body).not.toContain(localStoragePath);
    expect(body).not.toContain(binaryPath);
    expect(body).not.toContain('storage');
    expect(body).not.toContain('database');
    expect(body).not.toContain('media');
    expect(body).not.toContain('ffmpeg');
    expect(body).not.toContain('ffprobe');
    expect(body).not.toContain('packager');
  });

  test('returns 503 with an empty body when production readiness rejects', async () => {
    const secretValue = 'do-not-leak-secret-value';
    const loader = createHealthReadyLoader({
      checkProductionReadiness: async () => {
        throw new Error(`SQLITE_NOTADB ${secretValue} /srv/mediavault/storage/db.sqlite`);
      },
    });

    const response = await loader();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('');
    expect(body).not.toContain('SQLITE_NOTADB');
    expect(body).not.toContain(secretValue);
  });
});

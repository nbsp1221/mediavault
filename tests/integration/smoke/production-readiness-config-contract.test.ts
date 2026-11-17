import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('production readiness config contract', () => {
  test('excludes every operator environment variant and local vault from the build context', async () => {
    const patterns = (await readFile('.dockerignore', 'utf8'))
      .split('\n')
      .map((line) => line.trim());
    expect(patterns).toContain('.env');
    expect(patterns).toContain('.env.*');
    expect(patterns).toContain('.npmrc');
    expect(patterns).toContain('storage/');
    expect(patterns).toContain('binaries/');
    expect(patterns).toContain('node_modules/');
  });

  test('Dockerfile healthcheck uses the app-owned production readiness endpoint', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8');

    expect(dockerfile).toContain('http://localhost:3000/health/ready');
    expect(dockerfile).toContain('HEALTHCHECK --interval=30s --timeout=10s');
    expect(dockerfile).not.toContain("fetch('http://localhost:3000/')");
  });

  test('Docker Compose healthcheck uses readiness while keeping the simple default port binding', async () => {
    const compose = await readFile('docker-compose.yaml', 'utf8');

    expect(compose).toMatch(/^\s*-\s*['"]3000:3000['"]\s*$/m);
    expect(compose).toContain('http://localhost:3000/health/ready');
    expect(compose).not.toContain("fetch('http://localhost:3000/')");
  });

  test('default Compose file does not add a bundled reverse proxy service', async () => {
    const compose = await readFile('docker-compose.yaml', 'utf8');

    expect(compose).not.toMatch(/^\s+caddy:/m);
    expect(compose).not.toMatch(/^\s+nginx:/m);
    expect(compose).not.toMatch(/^\s+traefik:/m);
  });

  test('requires operators to supply production secrets instead of shipping example values', async () => {
    const envExample = await readFile('.env.example', 'utf8');
    for (const key of [
      'MEDIAVAULT_DATABASE_ENCRYPTION_KEY',
      'MEDIAVAULT_PLAYBACK_JWT_SECRET',
      'MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET',
      'MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET',
      'MEDIAVAULT_ADMIN_API_TOKEN',
    ]) {
      expect(envExample).toMatch(new RegExp(`^${key}=\\s*$`, 'm'));
    }
    expect(envExample).toContain('MEDIAVAULT_ADMIN_API_MODE=disabled');
  });
});

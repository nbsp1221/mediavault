import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('production readiness config contract', () => {
  test('Dockerfile healthcheck uses the app-owned production readiness endpoint', async () => {
    const dockerfile = await readFile('Dockerfile', 'utf8');

    expect(dockerfile).toContain('http://localhost:3000/health/ready');
    expect(dockerfile).toContain('HEALTHCHECK --interval=30s --timeout=10s');
    expect(dockerfile).not.toContain('fetch(\'http://localhost:3000/\')');
  });

  test('Docker Compose healthcheck uses readiness while keeping the simple default port binding', async () => {
    const compose = await readFile('docker-compose.yaml', 'utf8');

    expect(compose).toContain('"3000:3000"');
    expect(compose).toContain('http://localhost:3000/health/ready');
    expect(compose).not.toContain('fetch(\'http://localhost:3000/\')');
  });

  test('default Compose file does not add a bundled reverse proxy service', async () => {
    const compose = await readFile('docker-compose.yaml', 'utf8');

    expect(compose).not.toMatch(/^\s+caddy:/m);
    expect(compose).not.toMatch(/^\s+nginx:/m);
    expect(compose).not.toMatch(/^\s+traefik:/m);
  });

  test('deployment docs and env example describe the production full-vault requirements', async () => {
    const envExample = await readFile('.env.example', 'utf8');
    const readme = await readFile('README.md', 'utf8');
    const runtimeSpec = await readFile('docs/current-runtime-documentation-spec.md', 'utf8');
    const combinedDocs = `${envExample}\n${readme}\n${runtimeSpec}`;

    expect(combinedDocs).toContain('AUTH_SHARED_PASSWORD');
    expect(combinedDocs).toContain('VIDEO_JWT_SECRET');
    expect(combinedDocs).toContain('VIDEO_MASTER_ENCRYPTION_SEED');
    expect(combinedDocs).toContain('Back up');
    expect(combinedDocs).toContain('primary SQLite database');
    expect(combinedDocs).toContain('KEY_SALT_PREFIX');
    expect(combinedDocs).toContain('optional');
    expect(readme).toContain('3000:3000');
    expect(readme).toContain('HTTPS reverse proxy');
    expect(readme).toContain('operator-owned');
  });
});

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

const ACTIVE_AUTH_FILES = [
  'app/root.tsx',
  'app/routes/api.auth.login.ts',
  'app/routes/api.auth.me.ts',
  'app/composition/server/auth.ts',
] as const;

describe('auth ownership boundary', () => {
  test('active auth files do not depend on legacy auth bridge or legacy user repositories', async () => {
    for (const file of ACTIVE_AUTH_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source.includes('LegacyAuthStoreBridge'), file).toBe(false);
      expect(source.includes('auth-legacy-identity-bridge'), file).toBe(false);
      expect(source.includes('~/legacy/repositories'), file).toBe(false);
      expect(source.includes('~/legacy/types/auth'), file).toBe(false);
      expect(source.includes('~/legacy/'), file).toBe(false);
    }
  });
});

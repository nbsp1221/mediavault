import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return listFilesRecursively(absolutePath);
    }

    return [absolutePath];
  }));

  return files.flat();
}

async function collectActiveHomeTestFiles() {
  const uiHomeTests = (await listFilesRecursively(resolve(PROJECT_ROOT, 'tests/ui/home')))
    .filter(file => file.endsWith('.test.tsx'));
  const integrationHomeTests = (await listFilesRecursively(resolve(PROJECT_ROOT, 'tests/integration/library')))
    .filter(file => file.endsWith('.test.ts') && file.includes('/home-'));
  const e2eHomeSpecs = (await listFilesRecursively(resolve(PROJECT_ROOT, 'tests/e2e')))
    .filter(file => file.endsWith('.spec.ts') && file.includes('/home-'));

  return [
    ...uiHomeTests,
    ...integrationHomeTests,
    ...e2eHomeSpecs,
  ].map(file => file.replace(`${PROJECT_ROOT}/`, ''));
}

describe('home test boundary', () => {
  test('active home tests do not depend on screenshot baselines', async () => {
    const files = await collectActiveHomeTestFiles();

    expect(files.length).toBeGreaterThan(0);
    expect(files).not.toContain('tests/e2e/home-ui-parity.spec.ts');

    for (const file of files) {
      if (file.endsWith('tests/integration/library/home-test-boundary.test.ts')) {
        continue;
      }

      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source.includes('toHaveScreenshot('), file).toBe(false);
    }
  });
});

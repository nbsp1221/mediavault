import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const activeHomeRoots = [
  join(projectRoot, 'app/routes/_index.tsx'),
  join(projectRoot, 'app/pages/home'),
  join(projectRoot, 'app/entities/library-video'),
  join(projectRoot, 'app/entities/pending-video'),
  join(projectRoot, 'app/features/home-library-video-actions'),
  join(projectRoot, 'app/features/home-tag-filter'),
  join(projectRoot, 'app/features/home-quick-view'),
  join(projectRoot, 'app/widgets/home-shell'),
  join(projectRoot, 'app/widgets/home-library'),
];
const forbiddenImportPatterns = [
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]app\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/\.\.\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/\.\.\/\.\.\/legacy(?:\/|['"])/,
];

async function collectFiles(path: string): Promise<string[]> {
  const exists = await stat(path).then(() => true).catch(() => false);

  if (!exists) {
    return [];
  }

  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return [path];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(path, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  }));

  return files.flat();
}

describe('home UI ownership boundary', () => {
  test('active home route path does not import app/legacy', async () => {
    const files = (await Promise.all(activeHomeRoots.map(collectFiles))).flat();

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      const hasForbiddenImport = forbiddenImportPatterns.some(pattern => pattern.test(source));

      expect(hasForbiddenImport, `Forbidden legacy import found in ${relative(projectRoot, filePath)}`).toBe(false);
    }
  });

  test('home UI does not derive video authorization from owner or visibility fields', async () => {
    const files = (await Promise.all(activeHomeRoots.map(collectFiles))).flat();
    const forbiddenAuthorizationPatterns = [
      /VideoAccessPolicy/,
      /video-access\.policy/,
      /VideoViewer/,
      /visibility\s*===/,
      /ownerId\s*===/,
      /userId\s*===/,
    ];

    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');

      for (const pattern of forbiddenAuthorizationPatterns) {
        expect(
          pattern.test(source),
          `Forbidden UI authorization derivation found in ${relative(projectRoot, filePath)}: ${pattern}`,
        ).toBe(false);
      }
    }
  });
});

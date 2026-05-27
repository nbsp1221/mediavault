import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const files = [
  join(projectRoot, 'app/routes/_index.tsx'),
  join(projectRoot, 'app/composition/server/home-library-page.ts'),
];
const routeAndCompositionRoots = [
  join(projectRoot, 'app/routes'),
  join(projectRoot, 'app/composition/server'),
];
const forbiddenImportPatterns = [
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]app\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/\.\.\/legacy(?:\/|['"])/,
];

async function collectProductionSourceFiles(path: string): Promise<string[]> {
  const entryStat = await stat(path).catch(() => null);

  if (!entryStat) {
    return [];
  }

  if (entryStat.isFile()) {
    if (
      (path.endsWith('.ts') || path.endsWith('.tsx')) &&
      !path.endsWith('.test.ts') &&
      !path.endsWith('.test.tsx') &&
      !path.endsWith('.spec.ts') &&
      !path.endsWith('.spec.tsx')
    ) {
      return [path];
    }

    return [];
  }

  if (!entryStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(path, entry.name);

    if (entry.isDirectory()) {
      return collectProductionSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? collectProductionSourceFiles(fullPath) : [];
  }));

  return files.flat();
}

describe('home read route ownership boundary', () => {
  test('active home route and page composition do not import app/legacy directly', async () => {
    for (const filePath of files) {
      const source = await readFile(filePath, 'utf8');
      const hasForbiddenImport = forbiddenImportPatterns.some(pattern => pattern.test(source));

      expect(
        hasForbiddenImport,
        `Forbidden legacy import found in ${relative(projectRoot, filePath)}`,
      ).toBe(false);
    }
  });

  test('home page composition does not depend on the retired home pending-upload seam', async () => {
    const filePath = join(projectRoot, 'app/composition/server/home-library-page.ts');
    const source = await readFile(filePath, 'utf8');

    expect(
      source.includes('./home-legacy-pending-video-source'),
      'home-library-page.ts should not import the retired home pending seam',
    ).toBe(false);
  });

  test('home route and composition do not call unscoped library metadata reads', async () => {
    const forbiddenUnscopedReadPatterns = [
      /\.findAll\(/,
      /\.findByTag\(/,
      /\.findByTitle\(/,
      /\.getAllTags\(/,
      /\.search\(/,
      /\.listLibraryVideos\(\s*\)/,
    ];

    const sourceFiles = (await Promise.all(routeAndCompositionRoots.map(collectProductionSourceFiles))).flat();

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, 'utf8');

      for (const pattern of forbiddenUnscopedReadPatterns) {
        expect(
          pattern.test(source),
          `Forbidden unscoped library read found in ${relative(projectRoot, filePath)}: ${pattern}`,
        ).toBe(false);
      }
    }
  });
});

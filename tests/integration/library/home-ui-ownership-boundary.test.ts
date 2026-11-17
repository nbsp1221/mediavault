import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const activeHomeRoots = [
  join(projectRoot, 'app/routes/_index.tsx'),
  join(projectRoot, 'app/pages/home'),
  join(projectRoot, 'app/entities/library-video'),
  join(projectRoot, 'app/features/video-management'),
  join(projectRoot, 'app/widgets/product-shell'),
];

async function collectFiles(path: string): Promise<string[]> {
  const exists = await stat(path)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    return [];
  }

  if (path.endsWith('.ts') || path.endsWith('.tsx')) {
    return [path];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(path, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(fullPath);
      }

      return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    }),
  );

  return files.flat();
}

describe('home UI ownership boundary', () => {
  test('home UI does not derive video authorization from owner or visibility fields', async () => {
    const files = (await Promise.all(activeHomeRoots.map(collectFiles))).flat();
    expect(files.length).toBeGreaterThan(0);
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

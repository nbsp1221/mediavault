import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectRoot = process.cwd();
const routeFiles = [
  join(projectRoot, 'app/routes/api.update.$id.ts'),
  join(projectRoot, 'app/routes/api.delete.$id.ts'),
  join(projectRoot, 'app/routes/api.visibility.$id.ts'),
];
const compositionFiles = [
  join(projectRoot, 'app/composition/server/library.ts'),
  join(projectRoot, 'app/composition/server/ingest.ts'),
];
const forbiddenImportPatterns = [
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]app\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/\.\.\/legacy(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]\.\.\/\.\.\/\.\.\/legacy(?:\/|['"])/,
];

describe('home write route ownership boundary', () => {
  test('active home write routes do not import app/legacy directly', async () => {
    for (const filePath of routeFiles) {
      const source = await readFile(filePath, 'utf8');
      const hasForbiddenImport = forbiddenImportPatterns.some(pattern => pattern.test(source));

      expect(hasForbiddenImport, `Forbidden legacy import found in ${relative(projectRoot, filePath)}`).toBe(false);
    }
  });

  test('active library and ingest composition roots do not import retiring legacy seam files', async () => {
    for (const filePath of compositionFiles) {
      const source = await readFile(filePath, 'utf8');

      expect(source.includes('./library-legacy-video-mutation'), relative(projectRoot, filePath)).toBe(false);
      expect(source.includes('./canonical-video-metadata-legacy-store'), relative(projectRoot, filePath)).toBe(false);
    }
  });
});

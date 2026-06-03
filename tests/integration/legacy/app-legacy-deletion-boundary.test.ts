import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const EXPLICIT_FILES = [
  'vite.config.ts',
  'package.json',
  'eslint.config.js',
  '.github/workflows/ci.yml',
] as const;
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh', '.yml', '.yaml']);
const FORBIDDEN_PATTERNS = [
  /~\/legacy(?:\/|['"])/,
  /app\/legacy(?:\/|['"])/,
] as const;
const IGNORED_TEST_FILE_PATTERNS = [
  /ownership-boundary\.test\.(?:ts|tsx)$/,
  /test-boundary\.test\.(?:ts|tsx)$/,
  /tests\/integration\/legacy\/app-legacy-deletion-boundary\.test\.ts$/,
] as const;

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(join(PROJECT_ROOT, dir), { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const relativePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(relativePath);
    }

    if (!FILE_EXTENSIONS.has(extname(entry.name))) {
      return [];
    }

    if (IGNORED_TEST_FILE_PATTERNS.some(pattern => pattern.test(relativePath))) {
      return [];
    }

    return [relativePath];
  }));

  return nestedFiles.flat();
}

function shouldIgnoreLine(line: string) {
  return line.includes('.includes(') ||
    line.includes('.toContain(') ||
    line.includes('FORBIDDEN_PATTERNS') ||
    line.includes('forbiddenPatterns') ||
    line.includes('app import boundary') ||
    line.includes('reference app/legacy') ||
    line.includes('does not import app/legacy') ||
    line.includes('does not import legacy') ||
    (line.includes('test(') && line.includes('app/legacy'));
}

async function findBlockers() {
  const files = [
    ...await collectFiles('app'),
    ...await collectFiles('tests'),
    ...await collectFiles('scripts'),
    ...EXPLICIT_FILES,
  ];
  const blockers = new Map<string, string[]>();

  for (const file of files) {
    const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
    const matchingLines = source
      .split('\n')
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => !shouldIgnoreLine(line))
      .filter(({ line }) => FORBIDDEN_PATTERNS.some(pattern => pattern.test(line)))
      .map(({ line, lineNumber }) => `L${lineNumber}: ${line.trim()}`);

    if (matchingLines.length > 0) {
      blockers.set(file, matchingLines);
    }
  }

  return blockers;
}

describe('app import boundary', () => {
  test('non-doc app, test, script, and config surfaces no longer reference app/legacy', async () => {
    const blockers = await findBlockers();

    expect(
      [...blockers.entries()].map(([file, lines]) => `${file}\n${lines.join('\n')}`).join('\n\n'),
    ).toBe('');
  });
});

import { readdir } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const allowedAppRootEntries = new Set([
  'app.css',
  'composition',
  'entities',
  'entry.server.tsx',
  'features',
  'modules',
  'pages',
  'root.tsx',
  'routes',
  'routes.ts',
  'server.ts',
  'shared',
  'widgets',
]);

describe('app source root boundary', () => {
  test('app root contains only target architecture entries', async () => {
    const entries = await readdir('app');
    const unexpectedEntries = entries.filter(entry => !allowedAppRootEntries.has(entry));

    expect(unexpectedEntries).toEqual([]);
  });
});

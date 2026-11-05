import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { findClientBoundaryViolations } from '../../../scripts/check-client-boundary';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function clientOutput(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mediavault-client-boundary-'));
  roots.push(root);
  await mkdir(path.join(root, 'assets'));
  return root;
}

test('accepts browser media and UI output without server implementation markers', async () => {
  const root = await clientOutput();
  await writeFile(
    path.join(root, 'assets/player.js'),
    "const engine = { crypto: window.crypto, route: '/videos/token' };",
  );
  await writeFile(path.join(root, 'assets/font.woff2'), Buffer.from([0, 1, 2, 3]));
  expect(await findClientBoundaryViolations(root)).toEqual([]);
});

test.each([
  ['MEDIAVAULT_DATABASE_ENCRYPTION_KEY', 'server secret configuration'],
  ['MEDIAVAULT_AUTH_CLIENT_COOKIE_SECRET', 'server secret configuration'],
  ['node:crypto', 'Node.js builtin or browser-external shim'],
  ['__vite-browser-external', 'Node.js builtin or browser-external shim'],
  ['better-sqlite3-multiple-ciphers', 'native database or password implementation'],
  ['argon2', 'native database or password implementation'],
  ['SqlitePlaylistRepository', 'application server implementation'],
])(
  'rejects leaked %s without returning artifact source or secret values',
  async (marker, category) => {
    const root = await clientOutput();
    await writeFile(
      path.join(root, 'assets/leaked.js'),
      `const value = '${marker}:do-not-print-this-value';`,
    );
    expect(await findClientBoundaryViolations(root)).toEqual([
      { filePath: path.join('assets', 'leaked.js'), category },
    ]);
  },
);

test('audits source maps as publicly shipped artifacts too', async () => {
  const root = await clientOutput();
  await writeFile(
    path.join(root, 'assets/page.js.map'),
    JSON.stringify({ sourcesContent: ['SqliteLibraryVideoMetadataRepository'] }),
  );
  expect(await findClientBoundaryViolations(root)).toEqual([
    { filePath: path.join('assets', 'page.js.map'), category: 'application server implementation' },
  ]);
});

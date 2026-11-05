import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { ensureMediaTools } from '../../../scripts/lib/runtime/ensure-media-tools';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function workspace(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mediavault-tool-bootstrap-'));
  roots.push(root);
  await mkdir(path.join(root, 'binaries'));
  await Promise.all(
    files.map((file) => writeFile(path.join(root, 'binaries', file), 'operator-owned tool')),
  );
  return root;
}

test('bootstraps all missing tools for a fresh verification environment', async () => {
  const root = await workspace([]);
  const scripts: string[] = [];
  ensureMediaTools((name) => {
    scripts.push(name);
  }, root);
  expect(scripts).toEqual(['download:ffmpeg', 'download:shaka']);
});

test.each(['packager', 'packager.exe'])(
  'preserves an existing complete installation with %s',
  async (packager) => {
    const root = await workspace(['ffmpeg', 'ffprobe', packager]);
    const scripts: string[] = [];
    ensureMediaTools((name) => {
      scripts.push(name);
    }, root);
    expect(scripts).toEqual([]);
    expect(await readFile(path.join(root, 'binaries/ffmpeg'), 'utf8')).toBe('operator-owned tool');
  },
);

test.each(['ffmpeg', 'ffprobe'])(
  'fails without deleting a partial %s installation',
  async (file) => {
    const root = await workspace([file]);
    const scripts: string[] = [];
    expect(() =>
      ensureMediaTools((name) => {
        scripts.push(name);
      }, root),
    ).toThrow('installation is incomplete');
    expect(scripts).toEqual([]);
    expect(await readFile(path.join(root, 'binaries', file), 'utf8')).toBe('operator-owned tool');
  },
);

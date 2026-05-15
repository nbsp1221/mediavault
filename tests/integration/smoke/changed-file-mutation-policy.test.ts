import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildChangedFileMutationStrykerArgs,
  filterMutationEligibleChangedProductionFiles,
  isMutationEligibleChangedProductionFile,
  listMutationEligibleChangedProductionFiles,
  runChangedFileMutation,
} from '../../../scripts/lib/mutation/changed-file-mutation';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout,
      result.stderr,
    ].join('\n'));
  }
}

async function createGitRepo(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'changed-file-mutation-'));
  cleanupPaths.push(rootDir);

  run('git', ['init', '--initial-branch=main'], rootDir);
  run('git', ['config', 'user.email', 'test@example.com'], rootDir);
  run('git', ['config', 'user.name', 'Test User'], rootDir);

  await mkdir(join(rootDir, 'app', 'modules', 'library', 'domain'), { recursive: true });
  await mkdir(join(rootDir, 'docs'), { recursive: true });
  await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "base";\n');
  await writeFile(join(rootDir, 'docs', 'example.md'), '# Base\n');

  run('git', ['add', '.'], rootDir);
  run('git', ['commit', '-m', 'Initial commit'], rootDir);

  return rootDir;
}

describe('changed-file mutation filtering policy', () => {
  test('includes production TypeScript files in the calibrated changed-file mutation scope', () => {
    expect(isMutationEligibleChangedProductionFile('app/modules/library/domain/video-tag.ts')).toBe(true);
    expect(isMutationEligibleChangedProductionFile('app/widgets/home/ui/HomeLibraryWidget.tsx')).toBe(true);
    expect(isMutationEligibleChangedProductionFile('app/shared/lib/format-display-date.ts')).toBe(true);
  });

  test('excludes tests, generated UI primitives, app entrypoints, and non-app files', () => {
    const paths = [
      'app/modules/library/domain/video-tag.ts',
      'app/modules/library/domain/video-tag.test.ts',
      'app/modules/library/domain/video-tag.spec.ts',
      'app/shared/ui/button.tsx',
      'app/components/ui/button.tsx',
      'app/entry.client.tsx',
      'app/entry.server.tsx',
      'app/routes.ts',
      'app/server.ts',
      'docs/example.md',
      'package.json',
    ];

    expect(filterMutationEligibleChangedProductionFiles(paths)).toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('normalizes, dedupes, and sorts changed mutation paths before filtering', () => {
    expect(filterMutationEligibleChangedProductionFiles([
      String.raw`.\app\widgets\home\ui\HomeLibraryWidget.tsx`,
      'app/modules/library/domain/video-tag.ts',
      '/app/modules/library/domain/video-tag.ts',
      String.raw`app\shared\ui\button.tsx`,
    ])).toEqual([
      'app/modules/library/domain/video-tag.ts',
      'app/widgets/home/ui/HomeLibraryWidget.tsx',
    ]);
  });
});

describe('changed-file mutation git discovery', () => {
  test('finds unstaged, staged, and untracked eligible production changes through the shared local helper', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "unstaged";\n');
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'staged.ts'), 'export const staged = true;\n');
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'untracked.ts'), 'export const untracked = true;\n');
    run('git', ['add', 'app/modules/library/domain/staged.ts'], rootDir);

    await expect(listMutationEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/staged.ts',
      'app/modules/library/domain/untracked.ts',
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('does not include deleted files, docs-only changes, or tests-only changes', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'docs', 'example.md'), '# Changed\n');
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.test.ts'), 'import "./video-tag";\n');
    run('git', ['rm', 'app/modules/library/domain/video-tag.ts'], rootDir);

    await expect(listMutationEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([]);
  });

  test('does not include ignored untracked production files', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, '.gitignore'), 'app/modules/library/domain/ignored.ts\n');
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'ignored.ts'), 'export const ignored = true;\n');

    await expect(listMutationEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([]);
  });
});

describe('changed-file mutation CLI policy', () => {
  test('builds Stryker arguments with only comma-separated mutate targets', () => {
    const args = buildChangedFileMutationStrykerArgs({
      files: [
        'app/modules/library/domain/video-tag.ts',
        'app/widgets/home/ui/HomeLibraryWidget.tsx',
      ],
    });

    expect(args).toEqual([
      '--no-env-file',
      'x',
      'stryker',
      'run',
      '--mutate',
      'app/modules/library/domain/video-tag.ts,app/widgets/home/ui/HomeLibraryWidget.tsx',
    ]);
  });

  test('exits zero and does not spawn Stryker when no eligible files exist', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'docs', 'example.md'), '# Changed\n');
    const spawned: string[][] = [];
    const output: string[] = [];

    const status = await runChangedFileMutation({
      cwd: rootDir,
      spawn(command, args) {
        spawned.push([command, ...args]);
        return { status: 0 };
      },
      stdout: message => output.push(message),
      stderr: message => output.push(message),
    });

    expect(status).toBe(0);
    expect(spawned).toEqual([]);
    expect(output.join('\n')).toContain('No changed production files require mutation validation.');
  });

  test('prints eligible files before spawning Stryker and preserves the exit status', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "changed";\n');
    const spawned: string[][] = [];
    const output: string[] = [];

    const status = await runChangedFileMutation({
      cwd: rootDir,
      spawn(command, args) {
        spawned.push([command, ...args]);
        return { status: 7 };
      },
      stdout: message => output.push(message),
      stderr: message => output.push(message),
    });

    expect(status).toBe(7);
    expect(output.join('\n')).toContain('Changed production files requiring mutation validation:');
    expect(output.join('\n')).toContain('- app/modules/library/domain/video-tag.ts');
    expect(output.join('\n')).toContain('Running changed-file mutation gate with Stryker...');
    expect(spawned).toEqual([[
      'bun',
      '--no-env-file',
      'x',
      'stryker',
      'run',
      '--mutate',
      'app/modules/library/domain/video-tag.ts',
    ]]);
  });

  test('returns one when spawning Stryker fails or has no numeric exit status', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "changed";\n');

    await expect(runChangedFileMutation({
      cwd: rootDir,
      spawn() {
        return { error: new Error('spawn failed'), status: null };
      },
      stdout() {},
      stderr() {},
    })).resolves.toBe(1);

    await expect(runChangedFileMutation({
      cwd: rootDir,
      spawn() {
        return { status: null };
      },
      stdout() {},
      stderr() {},
    })).resolves.toBe(1);
  });

  test('keeps the CLI entrypoint thin and named after the package script', async () => {
    await expect(readFile('scripts/test-mutation-changed.ts', 'utf8')).resolves.toContain(
      'import { runChangedFileMutation } from \'./lib/mutation/changed-file-mutation\';',
    );
  });
});

describe('changed-file mutation package and contract policy', () => {
  test('keeps full mutation scoped separately while changed mutation accepts the broader changed-file scope', async () => {
    const strykerConfig = await readFile('stryker.config.mjs', 'utf8');

    expect(strykerConfig).toContain('mutate: [');
    expect(strykerConfig).toContain('\'app/modules/**/domain/**/*.ts\'');
    expect(strykerConfig).toContain('\'app/modules/**/application/use-cases/**/*.ts\'');
    expect(strykerConfig).toContain('\'!**/*.{test,spec}.ts\'');
    expect(strykerConfig).not.toContain('\'app/modules/**/application/**/*.ts\'');
    expect(strykerConfig).not.toContain('\'!app/modules/**/application/ports/**/*.ts\'');
    expect(strykerConfig).not.toContain('\'app/**/*.{ts,tsx}\'');
    expect(isMutationEligibleChangedProductionFile('app/widgets/home/ui/HomeLibraryWidget.tsx')).toBe(true);
    expect(isMutationEligibleChangedProductionFile('app/features/upload/ui/UploadDropzone.tsx')).toBe(true);
  });

  test('keeps phase-one mutation score non-blocking in Stryker config', async () => {
    const strykerConfig = await readFile('stryker.config.mjs', 'utf8');

    expect(strykerConfig).toContain('thresholds: {');
    expect(strykerConfig).toContain('high: 80');
    expect(strykerConfig).toContain('low: 60');
    expect(strykerConfig).toContain('break: null');
  });

  test('wires changed-file mutation into check without adding full mutation to check', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['test:mutation']).toBe(
      'AUTH_FAILED_LOGIN_DELAY_MS=1 LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file x stryker run',
    );
    expect(packageJson.scripts['test:mutation:changed']).toBe(
      'AUTH_FAILED_LOGIN_DELAY_MS=1 LOCAL_STREAMER_DISABLE_VITE_ENV_FILES=true bun --no-env-file ./scripts/test-mutation-changed.ts',
    );
    expect(packageJson.scripts.check).toContain('bun run test:mutation:changed');
    expect(packageJson.scripts.check).not.toContain('bun run test:mutation &&');
  });

  test('documents changed-file mutation in the verification contract', async () => {
    const contract = await readFile('docs/verification-contract.md', 'utf8');

    expect(contract).toContain('test:mutation:changed');
    expect(contract).toContain('staged, unstaged, and untracked local production files relative to `HEAD`');
    expect(contract).toContain('No changed production files require mutation validation.');
    expect(contract).toContain('does not enforce a mutation-score break threshold');
  });
});

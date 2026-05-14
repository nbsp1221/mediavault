import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildChangedFileCoverageVitestArgs,
  filterCoverageEligibleChangedProductionFiles,
  isCoverageEligibleChangedProductionFile,
  listChangedFilesSinceBase,
  listCoverageEligibleChangedProductionFiles,
  listLocalChangedFiles,
  runChangedFileCoverage,
} from '../../../scripts/lib/coverage/changed-file-coverage';

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
  const rootDir = await mkdtemp(join(tmpdir(), 'changed-file-coverage-'));
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
  run('git', ['branch', 'origin/main'], rootDir);

  return rootDir;
}

describe('changed-file coverage filtering policy', () => {
  test('includes production TypeScript files in the calibrated app coverage scope', () => {
    expect(isCoverageEligibleChangedProductionFile('app/modules/library/domain/video-tag.ts')).toBe(true);
    expect(isCoverageEligibleChangedProductionFile('app/widgets/home/ui/HomeLibraryWidget.tsx')).toBe(true);
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

    expect(filterCoverageEligibleChangedProductionFiles(paths)).toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('keeps the wrapper exclusions aligned with the calibrated Vitest coverage exclusions', async () => {
    const viteConfig = await readFile('vite.config.ts', 'utf8');
    const excludedPaths = [
      'app/modules/library/domain/video-tag.test.ts',
      'app/modules/library/domain/video-tag.spec.ts',
      'app/entry.client.tsx',
      'app/entry.server.tsx',
      'app/routes.ts',
      'app/server.ts',
      'app/shared/ui/button.tsx',
      'app/components/ui/button.tsx',
    ];

    expect(viteConfig).toContain('include: [\'app/**/*.{ts,tsx}\']');
    expect(viteConfig).toContain('app/**/*.test.{ts,tsx}');
    expect(viteConfig).toContain('app/**/*.spec.{ts,tsx}');
    expect(viteConfig).toContain('app/entry.client.tsx');
    expect(viteConfig).toContain('app/entry.server.tsx');
    expect(viteConfig).toContain('app/routes.ts');
    expect(viteConfig).toContain('app/server.ts');
    expect(viteConfig).toContain('app/shared/ui/**/*');
    expect(viteConfig).toContain('app/components/ui/**/*');
    expect(filterCoverageEligibleChangedProductionFiles(excludedPaths)).toEqual([]);
  });

  test('normalizes Windows and dot-prefixed paths before filtering', () => {
    expect(filterCoverageEligibleChangedProductionFiles([
      String.raw`.\app\modules\library\domain\video-tag.ts`,
      String.raw`app\shared\ui\button.tsx`,
    ])).toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });
});

describe('changed-file coverage git discovery', () => {
  test('finds unstaged production changes relative to HEAD', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "unstaged";\n');

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('finds staged production changes relative to HEAD', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "staged";\n');
    run('git', ['add', 'app/modules/library/domain/video-tag.ts'], rootDir);

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('finds untracked production files created before commit', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'untracked.ts'), 'export const value = true;\n');

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/untracked.ts',
    ]);
  });

  test('ignores committed branch changes in the default local pre-commit discovery', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "changed";\n');
    run('git', ['add', '.'], rootDir);
    run('git', ['commit', '-m', 'Change production file'], rootDir);

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([]);
  });

  test('finds modified production files relative to the merge base', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "changed";\n');
    run('git', ['add', '.'], rootDir);
    run('git', ['commit', '-m', 'Change production file'], rootDir);

    await expect(listChangedFilesSinceBase({
      baseRef: 'origin/main',
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/video-tag.ts',
    ]);
  });

  test('ignores deleted files and docs-only changes', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'docs', 'example.md'), '# Changed\n');
    run('git', ['rm', 'app/modules/library/domain/video-tag.ts'], rootDir);
    run('git', ['add', '.'], rootDir);
    run('git', ['commit', '-m', 'Change docs and delete production file'], rootDir);

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([]);
  });

  test('includes renamed production files through the ACMRT diff filter', async () => {
    const rootDir = await createGitRepo();
    run('git', [
      'mv',
      'app/modules/library/domain/video-tag.ts',
      'app/modules/library/domain/video-tag-label.ts',
    ], rootDir);
    run('git', ['commit', '-m', 'Rename production file'], rootDir);

    await expect(listChangedFilesSinceBase({
      baseRef: 'origin/main',
      cwd: rootDir,
    })).resolves.toEqual([
      'app/modules/library/domain/video-tag-label.ts',
    ]);
  });

  test('returns an empty eligible list for tests-only changes', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.test.ts'), 'import "./video-tag";\n');
    run('git', ['add', '.'], rootDir);
    run('git', ['commit', '-m', 'Add test file'], rootDir);

    await expect(listCoverageEligibleChangedProductionFiles({
      cwd: rootDir,
    })).resolves.toEqual([]);
  });

  test('branch discovery does not treat untracked production files as changed coverage inputs', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'untracked.ts'), 'export const value = true;\n');

    await expect(listChangedFilesSinceBase({
      baseRef: 'origin/main',
      cwd: rootDir,
    })).resolves.toEqual([]);
  });

  test('fails clearly when the base ref cannot be resolved', async () => {
    const rootDir = await createGitRepo();

    await expect(listChangedFilesSinceBase({
      baseRef: 'missing/base',
      cwd: rootDir,
    })).rejects.toThrow('Unable to resolve coverage changed base ref: missing/base');
  });
});

describe('changed-file coverage CLI policy', () => {
  test('builds Vitest arguments with local changed selection, coverage includes, reporters, and thresholds', () => {
    const args = buildChangedFileCoverageVitestArgs({
      files: [
        'app/modules/library/domain/video-tag.ts',
        'app/widgets/home/ui/HomeLibraryWidget.tsx',
      ],
    });

    expect(args).toEqual([
      '--no-env-file',
      './scripts/run-vitest.ts',
      'run',
      '--changed',
      '--coverage',
      '--coverage.reporter=text-summary',
      '--coverage.reporter=json-summary',
      '--coverage.thresholds.lines=80',
      '--coverage.thresholds.branches=80',
      '--coverage.thresholds.functions=80',
      '--coverage.thresholds.statements=80',
      '--coverage.include=app/modules/library/domain/video-tag.ts',
      '--coverage.include=app/widgets/home/ui/HomeLibraryWidget.tsx',
    ]);
  });

  test('exits zero and does not spawn Vitest when no eligible files exist', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'docs', 'example.md'), '# Changed\n');
    const spawned: string[][] = [];
    const output: string[] = [];

    const status = await runChangedFileCoverage({
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
    expect(output.join('\n')).toContain('No changed production files require coverage validation.');
  });

  test('prints eligible files before spawning Vitest and preserves the exit status', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'video-tag.ts'), 'export const tag = "changed";\n');
    const spawned: string[][] = [];
    const output: string[] = [];

    const status = await runChangedFileCoverage({
      cwd: rootDir,
      spawn(command, args) {
        spawned.push([command, ...args]);
        return { status: 7 };
      },
      stdout: message => output.push(message),
      stderr: message => output.push(message),
    });

    expect(status).toBe(7);
    expect(output.join('\n')).toContain('Changed production files requiring coverage:');
    expect(output.join('\n')).toContain('- app/modules/library/domain/video-tag.ts');
    expect(output.join('\n')).toContain('Running changed-file coverage gate with Vitest...');
    expect(spawned).toHaveLength(1);
    expect(spawned[0][0]).toBe('bun');
    expect(spawned[0]).toEqual(expect.arrayContaining([
      '--changed',
      '--coverage.include=app/modules/library/domain/video-tag.ts',
    ]));
    expect(spawned[0]).not.toContain('origin/main');
  });

  test('local discovery exposes the raw pre-commit file list for diagnostics', async () => {
    const rootDir = await createGitRepo();
    await writeFile(join(rootDir, 'docs', 'example.md'), '# Changed\n');
    await writeFile(join(rootDir, 'app', 'modules', 'library', 'domain', 'untracked.ts'), 'export const value = true;\n');

    await expect(listLocalChangedFiles({ cwd: rootDir })).resolves.toEqual([
      'app/modules/library/domain/untracked.ts',
      'docs/example.md',
    ]);
  });
});

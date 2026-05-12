import { spawnSync } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface HermeticViolation {
  filePath: string;
  message: string;
}

const SCAN_SKIP_PATHS = new Set([
  'tests/integration/smoke/browser-smoke-fixture-contract.test.ts',
  'tests/integration/smoke/hermetic-test-inputs.test.ts',
]);

const FORBIDDEN_PATTERNS = [
  {
    message: 'Tests and support scripts must not read playback fixtures from ignored repo-local storage.',
    pattern: /process\.cwd\(\)\s*,\s*['"]storage['"]/,
  },
  {
    message: 'Tests and support scripts must not resolve playback fixture inputs from retired repo-local storage paths.',
    pattern: /storage\/data\/videos\//,
  },
] as const;

const REQUIRED_FIXTURE_PATHS = [
  'tests/fixtures/upload/smoke-upload.mp4',
  'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/manifest.mpd',
  'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/video/init.mp4',
  'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/audio/init.mp4',
  'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/key.bin',
  'tests/fixtures/playback/68e5f819-15e8-41ef-90ee-8a96769311b7/thumbnail.jpg',
  'tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a/manifest.mpd',
  'tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a/video/init.mp4',
  'tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a/audio/init.mp4',
  'tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a/key.bin',
  'tests/fixtures/playback/754c6828-621c-4df6-9cf8-a3d77297b85a/thumbnail.jpg',
] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

async function collectTargetFiles(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const queue = ['tests/support', 'tests/e2e', 'tests/integration/smoke', 'scripts'];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const absoluteCurrent = resolve(rootDir, current);

    let entries;
    try {
      entries = await readdir(absoluteCurrent, { withFileTypes: true });
    }
    catch {
      continue;
    }

    for (const entry of entries) {
      const relativePath = `${current}/${entry.name}`;

      if (entry.isDirectory()) {
        queue.push(relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!relativePath.endsWith('.ts') && !relativePath.endsWith('.tsx')) {
        continue;
      }

      if (SCAN_SKIP_PATHS.has(relativePath)) {
        continue;
      }

      results.push(relativePath);
    }
  }

  results.push('playwright.config.ts');
  return results;
}

async function isIgnoredByGit(filePath: string): Promise<boolean> {
  const result = spawnSync('git', ['check-ignore', '-q', filePath], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  return result.status === 0;
}

async function isTrackedByGit(filePath: string): Promise<boolean> {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', filePath], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  return result.status === 0;
}

async function hasGitMetadata(rootDir: string): Promise<boolean> {
  return fileExists(resolve(rootDir, '.git'));
}

export async function collectHermeticTestInputViolations(rootDir = process.cwd()): Promise<HermeticViolation[]> {
  const violations: HermeticViolation[] = [];
  const gitAware = await hasGitMetadata(rootDir);

  for (const relativePath of REQUIRED_FIXTURE_PATHS) {
    const absolutePath = resolve(rootDir, relativePath);
    if (!(await fileExists(absolutePath))) {
      violations.push({
        filePath: relativePath,
        message: 'Required tracked playback fixture asset is missing.',
      });
      continue;
    }

    if (await isIgnoredByGit(relativePath)) {
      violations.push({
        filePath: relativePath,
        message: 'Required playback fixture asset is ignored by git.',
      });
      continue;
    }

    if (gitAware && !(await isTrackedByGit(relativePath))) {
      violations.push({
        filePath: relativePath,
        message: 'Required playback fixture asset is not tracked by git.',
      });
    }
  }

  const targetFiles = await collectTargetFiles(rootDir);

  for (const relativePath of targetFiles) {
    const absolutePath = resolve(rootDir, relativePath);
    if (!(await fileExists(absolutePath))) {
      continue;
    }
    const source = await readFile(absolutePath, 'utf8');

    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(source)) {
        violations.push({
          filePath: relativePath,
          message: forbidden.message,
        });
      }
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = await collectHermeticTestInputViolations();

  if (violations.length > 0) {
    console.error('Hermetic test input contract failed.');
    for (const violation of violations) {
      console.error(`- ${violation.filePath}: ${violation.message}`);
    }
    process.exit(1);
  }

  console.log('Hermetic test input contract passed.');
}

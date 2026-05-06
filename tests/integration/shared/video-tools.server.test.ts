import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const ORIGINAL_FFMPEG_PATH = process.env.FFMPEG_PATH;
const ORIGINAL_FFPROBE_PATH = process.env.FFPROBE_PATH;
const ORIGINAL_SHAKA_PACKAGER_PATH = process.env.SHAKA_PACKAGER_PATH;

describe('video tools config', () => {
  let rootDir = '';
  let previousCwd = '';

  afterEach(async () => {
    vi.resetModules();

    if (ORIGINAL_FFMPEG_PATH === undefined) {
      delete process.env.FFMPEG_PATH;
    }
    else {
      process.env.FFMPEG_PATH = ORIGINAL_FFMPEG_PATH;
    }

    if (ORIGINAL_FFPROBE_PATH === undefined) {
      delete process.env.FFPROBE_PATH;
    }
    else {
      process.env.FFPROBE_PATH = ORIGINAL_FFPROBE_PATH;
    }

    if (ORIGINAL_SHAKA_PACKAGER_PATH === undefined) {
      delete process.env.SHAKA_PACKAGER_PATH;
    }
    else {
      process.env.SHAKA_PACKAGER_PATH = ORIGINAL_SHAKA_PACKAGER_PATH;
    }

    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
      rootDir = '';
    }

    if (previousCwd) {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });

  test('uses an explicit FFMPEG_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    process.env.FFMPEG_PATH = explicitPath;
    vi.resetModules();

    const { getFFmpegPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFmpegPath()).toBe(explicitPath);
  });

  test('prefers an existing project-local binaries/ffmpeg over system ffmpeg', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(rootDir, 'binaries'), { recursive: true }));
      await writeFile(path.join(rootDir, 'binaries', 'ffmpeg'), '', { mode: 0o755 });
      delete process.env.FFMPEG_PATH;
      vi.resetModules();

      const { getFFmpegPath } = await import('../../../app/shared/config/video-tools.server');

      expect(getFFmpegPath()).toBe(path.join(rootDir, 'binaries', 'ffmpeg'));
    }
    finally {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });

  test('uses an explicit FFPROBE_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    process.env.FFPROBE_PATH = explicitPath;
    vi.resetModules();

    const { getFFprobePath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFprobePath()).toBe(explicitPath);
  });

  test('prefers an existing project-local binaries/ffprobe over system ffprobe', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(rootDir, 'binaries'), { recursive: true }));
      await writeFile(path.join(rootDir, 'binaries', 'ffprobe'), '', { mode: 0o755 });
      delete process.env.FFPROBE_PATH;
      vi.resetModules();

      const { getFFprobePath } = await import('../../../app/shared/config/video-tools.server');

      expect(getFFprobePath()).toBe(path.join(rootDir, 'binaries', 'ffprobe'));
    }
    finally {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });

  test('uses an explicit SHAKA_PACKAGER_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    process.env.SHAKA_PACKAGER_PATH = explicitPath;
    vi.resetModules();

    const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getShakaPackagerPath()).toBe(explicitPath);
  });

  test('prefers an existing SHAKA_PACKAGER_PATH over local binaries and the system fallback', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(rootDir, 'binaries'), { recursive: true }));
      await writeFile(path.join(rootDir, 'binaries', 'packager'), '', { mode: 0o755 });
      const explicitPackagerPath = path.join(rootDir, 'custom-packager');
      await writeFile(explicitPackagerPath, '', { mode: 0o755 });
      process.env.SHAKA_PACKAGER_PATH = explicitPackagerPath;
      vi.resetModules();

      const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

      expect(getShakaPackagerPath()).toBe(explicitPackagerPath);
    }
    finally {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });

  test('prefers an existing project-local binaries/packager over system packager', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(rootDir, 'binaries'), { recursive: true }));
      await writeFile(path.join(rootDir, 'binaries', 'packager'), '', { mode: 0o755 });
      delete process.env.SHAKA_PACKAGER_PATH;
      vi.resetModules();

      const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

      expect(getShakaPackagerPath()).toBe(path.join(rootDir, 'binaries', 'packager'));
    }
    finally {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });

  test('prefers an existing project-local binaries/packager.exe over system packager', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    previousCwd = process.cwd();
    process.chdir(rootDir);

    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(rootDir, 'binaries'), { recursive: true }));
      await writeFile(path.join(rootDir, 'binaries', 'packager.exe'), '', { mode: 0o755 });
      delete process.env.SHAKA_PACKAGER_PATH;
      vi.resetModules();

      const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

      expect(getShakaPackagerPath()).toBe(path.join(rootDir, 'binaries', 'packager.exe'));
    }
    finally {
      process.chdir(previousCwd);
      previousCwd = '';
    }
  });
});

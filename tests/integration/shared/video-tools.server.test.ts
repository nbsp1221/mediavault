import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('video tools config', () => {
  let rootDir = '';

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
      rootDir = '';
    }
  });

  test('uses an explicit FFMPEG_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    vi.resetModules();

    const { getFFmpegPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFmpegPath({ FFMPEG_PATH: explicitPath })).toBe(explicitPath);
  });

  test('prefers an existing project-local binaries/ffmpeg over system ffmpeg', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    await mkdir(path.join(rootDir, 'binaries'), { recursive: true });
    await writeFile(path.join(rootDir, 'binaries', 'ffmpeg'), '', { mode: 0o755 });
    vi.resetModules();

    const { getFFmpegPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFmpegPath({})).toBe(path.join(rootDir, 'binaries', 'ffmpeg'));
  });

  test('uses an explicit FFPROBE_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    vi.resetModules();

    const { getFFprobePath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFprobePath({ FFPROBE_PATH: explicitPath })).toBe(explicitPath);
  });

  test('prefers an existing project-local binaries/ffprobe over system ffprobe', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    await mkdir(path.join(rootDir, 'binaries'), { recursive: true });
    await writeFile(path.join(rootDir, 'binaries', 'ffprobe'), '', { mode: 0o755 });
    vi.resetModules();

    const { getFFprobePath } = await import('../../../app/shared/config/video-tools.server');

    expect(getFFprobePath({})).toBe(path.join(rootDir, 'binaries', 'ffprobe'));
  });

  test('uses an explicit SHAKA_PACKAGER_PATH even when the path is stale', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    const explicitPath = '/tmp/does-not-exist';
    vi.resetModules();

    const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getShakaPackagerPath({ SHAKA_PACKAGER_PATH: explicitPath })).toBe(explicitPath);
  });

  test('prefers an existing SHAKA_PACKAGER_PATH over local binaries and the system fallback', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    await mkdir(path.join(rootDir, 'binaries'), { recursive: true });
    await writeFile(path.join(rootDir, 'binaries', 'packager'), '', { mode: 0o755 });
    const explicitPackagerPath = path.join(rootDir, 'custom-packager');
    await writeFile(explicitPackagerPath, '', { mode: 0o755 });
    vi.resetModules();

    const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getShakaPackagerPath({ SHAKA_PACKAGER_PATH: explicitPackagerPath })).toBe(explicitPackagerPath);
  });

  test('prefers an existing project-local binaries/packager over system packager', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    await mkdir(path.join(rootDir, 'binaries'), { recursive: true });
    await writeFile(path.join(rootDir, 'binaries', 'packager'), '', { mode: 0o755 });
    vi.resetModules();

    const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getShakaPackagerPath({})).toBe(path.join(rootDir, 'binaries', 'packager'));
  });

  test('prefers an existing project-local binaries/packager.exe over system packager', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'local-streamer-video-tools-'));
    vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
    await mkdir(path.join(rootDir, 'binaries'), { recursive: true });
    await writeFile(path.join(rootDir, 'binaries', 'packager.exe'), '', { mode: 0o755 });
    vi.resetModules();

    const { getShakaPackagerPath } = await import('../../../app/shared/config/video-tools.server');

    expect(getShakaPackagerPath({})).toBe(path.join(rootDir, 'binaries', 'packager.exe'));
  });
});

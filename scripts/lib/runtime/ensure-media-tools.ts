import { existsSync } from 'node:fs';
import path from 'node:path';

/** Bootstrap missing tools without replacing developer-owned binaries during verification. */
export function ensureMediaTools(runScript: (name: string) => void, rootDir = process.cwd()): void {
  const hasFfmpeg = existsSync(path.join(rootDir, 'binaries/ffmpeg'));
  const hasFfprobe = existsSync(path.join(rootDir, 'binaries/ffprobe'));
  if (hasFfmpeg !== hasFfprobe) {
    throw new Error(
      'The local FFmpeg installation is incomplete. Repair it explicitly with pnpm download:ffmpeg before verification.',
    );
  }
  if (!hasFfmpeg) {
    runScript('download:ffmpeg');
  }
  if (
    !existsSync(path.join(rootDir, 'binaries/packager')) &&
    !existsSync(path.join(rootDir, 'binaries/packager.exe'))
  ) {
    runScript('download:shaka');
  }
}

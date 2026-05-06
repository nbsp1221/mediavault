import { existsSync } from 'node:fs';
import path from 'node:path';

function readExplicitPath(value: string | undefined): string | null {
  const normalized = value?.trim();

  return normalized || null;
}

export function getFFmpegPath(): string {
  const explicitPath = readExplicitPath(process.env.FFMPEG_PATH);
  if (explicitPath) {
    return explicitPath;
  }

  const localFFmpeg = path.join(process.cwd(), 'binaries', 'ffmpeg');
  if (existsSync(localFFmpeg)) {
    return localFFmpeg;
  }

  return 'ffmpeg';
}

export function getFFprobePath(): string {
  const explicitPath = readExplicitPath(process.env.FFPROBE_PATH);
  if (explicitPath) {
    return explicitPath;
  }

  const localFFprobe = path.join(process.cwd(), 'binaries', 'ffprobe');
  if (existsSync(localFFprobe)) {
    return localFFprobe;
  }

  return 'ffprobe';
}

export function getShakaPackagerPath(): string {
  const explicitPath = readExplicitPath(process.env.SHAKA_PACKAGER_PATH);
  if (explicitPath) {
    return explicitPath;
  }

  const localPackager = path.join(process.cwd(), 'binaries', 'packager');
  if (existsSync(localPackager)) {
    return localPackager;
  }

  const localPackagerExe = path.join(process.cwd(), 'binaries', 'packager.exe');
  if (existsSync(localPackagerExe)) {
    return localPackagerExe;
  }

  return 'packager';
}

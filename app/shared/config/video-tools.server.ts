import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RuntimeEnvInput } from './runtime-env.server';
import { getVideoToolOverridesConfigFromEnv } from './app-config.server';

export function getFFmpegPath(env?: RuntimeEnvInput): string {
  const explicitPath = getVideoToolOverridesConfigFromEnv(env ?? process.env).ffmpegPath;
  if (explicitPath) {
    return explicitPath;
  }

  const localFFmpeg = path.join(process.cwd(), 'binaries', 'ffmpeg');
  if (existsSync(localFFmpeg)) {
    return localFFmpeg;
  }

  return 'ffmpeg';
}

export function getFFprobePath(env?: RuntimeEnvInput): string {
  const explicitPath = getVideoToolOverridesConfigFromEnv(env ?? process.env).ffprobePath;
  if (explicitPath) {
    return explicitPath;
  }

  const localFFprobe = path.join(process.cwd(), 'binaries', 'ffprobe');
  if (existsSync(localFFprobe)) {
    return localFFprobe;
  }

  return 'ffprobe';
}

export function getShakaPackagerPath(env?: RuntimeEnvInput): string {
  const explicitPath = getVideoToolOverridesConfigFromEnv(env ?? process.env).shakaPackagerPath;
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

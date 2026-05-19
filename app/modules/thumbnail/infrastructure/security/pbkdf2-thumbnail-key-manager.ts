import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_ENV_KEYS } from '~/shared/config/public-env.server';
import { getStoragePaths } from '~/shared/config/storage-paths.server';

interface ThumbnailKeyGenerationResult {
  key: Buffer;
  keyInfoFile: string;
}

interface Pbkdf2ThumbnailKeyManagerDependencies {
  env?: NodeJS.ProcessEnv;
  testMode?: boolean;
}

export class Pbkdf2ThumbnailKeyManager {
  private readonly masterSeed: string;
  private readonly rounds: number;
  private readonly saltPrefix: string;

  constructor(deps: Pbkdf2ThumbnailKeyManagerDependencies = {}) {
    const env = deps.env ?? process.env;
    const isTest = deps.testMode ?? (env.NODE_ENV === 'test' || env.VITEST === 'true');

    if (isTest) {
      this.masterSeed = 'test-master-seed-for-unit-tests-only';
      this.rounds = 100000;
      this.saltPrefix = 'test-salt';
      return;
    }

    const masterSeed = env[PUBLIC_ENV_KEYS.mediaKeyDerivationSecret];
    if (!masterSeed) {
      throw new Error(`${PUBLIC_ENV_KEYS.mediaKeyDerivationSecret} environment variable is required for video encryption`);
    }

    this.masterSeed = masterSeed;
    this.rounds = 100000;
    this.saltPrefix = env[PUBLIC_ENV_KEYS.mediaKeyDerivationSalt] || 'local-streamer-video-v1';
  }

  async generateAndStoreKey(videoId: string): Promise<ThumbnailKeyGenerationResult> {
    const key = this.generateVideoKey(videoId);
    await this.storeVideoKey(videoId, key);
    const keyInfoFile = await this.createKeyInfoFile(videoId);

    return { key, keyInfoFile };
  }

  async retrieveKey(videoId: string): Promise<Buffer> {
    const { videosDir } = getStoragePaths();
    return fs.readFile(join(videosDir, videoId, 'key.bin'));
  }

  async keyExists(videoId: string): Promise<boolean> {
    try {
      const { videosDir } = getStoragePaths();
      await fs.access(join(videosDir, videoId, 'key.bin'));
      return true;
    }
    catch {
      return false;
    }
  }

  private generateVideoKey(videoId: string): Buffer {
    const salt = crypto.createHash('sha256')
      .update(this.saltPrefix + videoId)
      .digest();

    return crypto.pbkdf2Sync(this.masterSeed, salt, this.rounds, 16, 'sha256');
  }

  private async storeVideoKey(videoId: string, key: Buffer): Promise<void> {
    const { videosDir } = getStoragePaths();
    const videoDir = join(videosDir, videoId);
    await fs.mkdir(videoDir, { recursive: true });
    await fs.writeFile(join(videoDir, 'key.bin'), key);
  }

  private async createKeyInfoFile(videoId: string): Promise<string> {
    const { videosDir } = getStoragePaths();
    const videoDir = join(videosDir, videoId);
    const keyInfoPath = join(videoDir, 'keyinfo.txt');
    const keyPath = join(videoDir, 'key.bin');
    const keyUrl = `/api/video-key/${videoId}`;

    await fs.writeFile(keyInfoPath, `${keyUrl}\n${keyPath}\n`);

    return keyInfoPath;
  }
}

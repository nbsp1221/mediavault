import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedRuntimeAuthUser } from './auth-account';
import { copyPlaybackFixture } from './copy-playback-fixture';
import { REQUIRED_BROWSER_PLAYBACK_FIXTURE_IDS } from './playback-fixture-manifest';
import { seedLibraryVideoMetadata } from './seed-library-video-metadata';

interface RuntimeTestWorkspace {
  authDbPath: string;
  databasePath: string;
  cleanup: () => Promise<void>;
  rootDir: string;
  storageDir: string;
  videoMetadataDbPath: string;
}

const HOME_VIDEO_ID = '68e5f819-15e8-41ef-90ee-8a96769311b7';
const FILTERED_VIDEO_ID = '754c6828-621c-4df6-9cf8-a3d77297b85a';

const SEEDED_VIDEOS = [
  {
    createdAt: '2026-03-08T00:00:00.000Z',
    description: 'Playtime test upload',
    duration: 90,
    contentTypeSlug: 'clip',
    genreSlugs: ['action'],
    id: HOME_VIDEO_ID,
    tags: ['action', 'vault'],
    thumbnailUrl: '/api/thumbnail/68e5f819-15e8-41ef-90ee-8a96769311b7',
    title: 'playtime',
    videoUrl: `/videos/${HOME_VIDEO_ID}/manifest.mpd`,
  },
  {
    createdAt: '2026-03-08T00:00:00.000Z',
    description: 'Playtime related fixture',
    duration: 105,
    contentTypeSlug: 'clip',
    genreSlugs: ['drama'],
    id: FILTERED_VIDEO_ID,
    ownerId: 'other-user',
    tags: ['ui'],
    thumbnailUrl: '/api/thumbnail/754c6828-621c-4df6-9cf8-a3d77297b85a',
    title: 'playtime2',
    videoUrl: `/videos/${FILTERED_VIDEO_ID}/manifest.mpd`,
    visibility: 'public' as const,
  },
];

export async function createRuntimeTestWorkspace(): Promise<RuntimeTestWorkspace> {
  const rootDir = await mkdtemp(join(tmpdir(), 'local-streamer-runtime-'));
  const storageDir = join(rootDir, 'storage');
  const databasePath = join(storageDir, 'db.sqlite');
  const authDbPath = databasePath;
  const videoMetadataDbPath = databasePath;

  await mkdir(join(storageDir, 'videos'), { recursive: true });

  await Promise.all(
    REQUIRED_BROWSER_PLAYBACK_FIXTURE_IDS.map(videoId => copyPlaybackFixture({
      targetVideosDir: join(storageDir, 'videos'),
      videoId,
    })),
  );

  await seedRuntimeAuthUser(databasePath);
  await seedLibraryVideoMetadata(databasePath, SEEDED_VIDEOS);

  return {
    authDbPath,
    databasePath,
    cleanup: async () => {
      await rm(rootDir, { force: true, recursive: true });
    },
    rootDir,
    storageDir,
    videoMetadataDbPath,
  };
}

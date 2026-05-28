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
export const OWNER_PUBLIC_VIDEO_ID = HOME_VIDEO_ID;
export const OTHER_PUBLIC_VIDEO_ID = FILTERED_VIDEO_ID;
export const OWNER_PRIVATE_VIDEO_ID = '2f4f9f2d-8c56-4c51-93f8-6d3a5dfb8e10';
export const OTHER_PRIVATE_VIDEO_ID = 'a64a979f-1e64-4f38-8d9b-035ff7f4730a';

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
    visibility: 'public' as const,
  },
  {
    createdAt: '2026-03-08T00:00:00.000Z',
    description: 'Owner private playback fixture',
    duration: 95,
    contentTypeSlug: 'clip',
    genreSlugs: ['action'],
    id: OWNER_PRIVATE_VIDEO_ID,
    tags: ['private', 'vault'],
    title: 'owner-private-playtime',
    videoUrl: `/videos/${OWNER_PRIVATE_VIDEO_ID}/manifest.mpd`,
    visibility: 'private' as const,
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
  {
    createdAt: '2026-03-08T00:00:00.000Z',
    description: 'Non-owner private playback fixture',
    duration: 110,
    contentTypeSlug: 'clip',
    genreSlugs: ['drama'],
    id: OTHER_PRIVATE_VIDEO_ID,
    ownerId: 'other-user',
    tags: ['private', 'ui'],
    title: 'other-private-playtime',
    videoUrl: `/videos/${OTHER_PRIVATE_VIDEO_ID}/manifest.mpd`,
    visibility: 'private' as const,
  },
];

export async function createRuntimeTestWorkspace(): Promise<RuntimeTestWorkspace> {
  const rootDir = await mkdtemp(join(tmpdir(), 'local-streamer-runtime-'));
  const storageDir = join(rootDir, 'storage');
  const databasePath = join(storageDir, 'db.sqlite');
  const authDbPath = databasePath;
  const videoMetadataDbPath = databasePath;

  await mkdir(join(storageDir, 'videos'), { recursive: true });

  await Promise.all([
    ...REQUIRED_BROWSER_PLAYBACK_FIXTURE_IDS.map(videoId => copyPlaybackFixture({
      targetVideosDir: join(storageDir, 'videos'),
      videoId,
    })),
  ]);

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

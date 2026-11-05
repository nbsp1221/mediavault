import { afterEach, describe, expect, test, vi } from 'vitest';
import { routeArgs } from '../../helpers/route-args';
import { createPlaylistRuntimeTestWorkspace } from '../../support/create-playlist-runtime-test-workspace';

async function fixture() {
  return createPlaylistRuntimeTestWorkspace({
    playlists: [],
    videos: [
      {
        id: 'tag-video',
        title: 'Tag video',
        duration: 1,
        tags: ['original'],
        videoUrl: '/videos/tag-video/manifest.mpd',
      },
    ],
  });
}

describe('Video tag HTTP boundary', { concurrent: false }, () => {
  afterEach(() => vi.resetModules());
  test('persists Unicode tags, preserves meaningful punctuation, and returns the same canonical values', async () => {
    const workspace = await fixture();
    try {
      const cookie = await workspace.login();
      const { action } = await import('../../../app/routes/api.update.$id');
      const response = await action(
        routeArgs({
          params: { id: 'tag-video' },
          request: new Request('http://localhost/api/update/tag-video', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'http://localhost',
              'Cookie': cookie,
            },
            body: JSON.stringify({
              title: 'Tag video',
              tags: ['가족 여행', '가족 여행'.normalize('NFD'), 'C++', 'CAFE\u0301', 'old_tag'],
            }),
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        video: { tags: ['c++', 'café', 'old_tag', '가족 여행'] },
      });
      const { SqliteLibraryVideoMetadataRepository } =
        await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository');
      expect(
        (
          await new SqliteLibraryVideoMetadataRepository({
            dbPath: workspace.databasePath,
          }).findById('tag-video')
        )?.tags,
      ).toEqual(['c++', 'café', 'old_tag', '가족 여행']);
    } finally {
      await workspace.cleanup();
    }
  });
  test('rejects malformed tag values with 400 and leaves stored metadata unchanged', async () => {
    const workspace = await fixture();
    try {
      const cookie = await workspace.login();
      const { action } = await import('../../../app/routes/api.update.$id');
      for (const tags of [null, 'text', [42], [''], ['bad\u0000tag'], ['가'.repeat(101)]]) {
        const response = await action(
          routeArgs({
            params: { id: 'tag-video' },
            request: new Request('http://localhost/api/update/tag-video', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Origin': 'http://localhost',
                'Cookie': cookie,
              },
              body: JSON.stringify({ title: 'Should not save', tags }),
            }),
          }),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ success: false });
      }
      const { SqliteLibraryVideoMetadataRepository } =
        await import('../../../app/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository');
      expect(
        await new SqliteLibraryVideoMetadataRepository({ dbPath: workspace.databasePath }).findById(
          'tag-video',
        ),
      ).toMatchObject({ title: 'Tag video', tags: ['original'] });
      const home = await import('../../../app/routes/_index');
      const invalid = new URL('http://localhost/');
      invalid.searchParams.append('tag', 'bad\u0000tag');
      await expect(home.loader(routeArgs({ request: new Request(invalid) }))).rejects.toMatchObject(
        { status: 400 },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

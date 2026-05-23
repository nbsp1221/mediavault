import { describe, expect, test } from 'vitest';
import { VideoEntity } from './video.entity';

function createVideo(overrides: Partial<Parameters<typeof VideoEntity.create>[0]> = {}) {
  return VideoEntity.create({
    createdAt: new Date('2026-05-16T00:00:00.000Z'),
    duration: 10,
    id: 'video-1',
    ownerId: 'user-1',
    tags: ['tag'],
    title: 'Original title',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'private',
    ...overrides,
  });
}

describe('VideoEntity', () => {
  test('creates a normalized owned video', () => {
    const result = createVideo({
      genreSlugs: ['education'],
      tags: ['first'],
      title: '  Trimmed  ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.video.id).toBe('video-1');
    expect(result.video.ownerId).toBe('user-1');
    expect(result.video.title).toBe('Trimmed');
    expect(result.video.visibility).toBe('private');
    expect(result.video.genreSlugs).toEqual(['education']);
    expect(result.video.tags).toEqual(['first']);
  });

  test('rejects invalid core fields', () => {
    expect(createVideo({ id: '../bad' })).toEqual({
      ok: false,
      reason: 'VIDEO_ID_UNSAFE',
    });
    expect(createVideo({ ownerId: '   ' })).toEqual({
      ok: false,
      reason: 'VIDEO_OWNER_REQUIRED',
    });
    expect(createVideo({ title: '   ' })).toEqual({
      ok: false,
      reason: 'VIDEO_TITLE_REQUIRED',
    });
    expect(createVideo({ visibility: 'restricted' })).toEqual({
      ok: false,
      reason: 'VIDEO_VISIBILITY_INVALID',
    });
  });

  test('changes visibility and metadata through methods', () => {
    const result = createVideo();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.video.makePublic();
    expect(result.video.visibility).toBe('public');
    result.video.makePrivate();
    expect(result.video.visibility).toBe('private');
    expect(result.video.isOwnedBy('user-1')).toBe(true);
    expect(result.video.isOwnedBy('user-2')).toBe(false);

    expect(result.video.changeMetadata({
      contentTypeSlug: 'lecture',
      description: 'Updated description',
      genreSlugs: ['education'],
      tags: ['next'],
      title: '  Next title  ',
    })).toEqual({
      ok: true,
      video: result.video,
    });
    expect(result.video.contentTypeSlug).toBe('lecture');
    expect(result.video.description).toBe('Updated description');
    expect(result.video.genreSlugs).toEqual(['education']);
    expect(result.video.tags).toEqual(['next']);
    expect(result.video.title).toBe('Next title');
  });
});

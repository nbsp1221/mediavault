import { describe, expect, test } from 'vitest';
import type { PlaybackCatalogVideo } from '../ports/video-catalog.port';
import { findRelatedVideos } from './related-videos';

function video(id: string, tags: string[]): PlaybackCatalogVideo {
  return {
    createdAt: new Date(0),
    duration: 60,
    id,
    tags,
    title: id,
    videoUrl: `/videos/${id}/manifest.mpd`,
  };
}

describe('related video selection', () => {
  test('matches tags without case, excludes the current video and preserves catalog order up to ten', () => {
    const current = video('current', ['Drama']);
    const matches = Array.from({ length: 12 }, (_, index) => video(`related-${index}`, ['drama']));
    expect(
      findRelatedVideos(current, [current, video('unrelated', ['comedy']), ...matches]),
    ).toEqual(matches.slice(0, 10));
  });

  test('returns no recommendations without current-video tags', () => {
    expect(findRelatedVideos(video('current', []), [video('candidate', ['drama'])])).toEqual([]);
  });
});

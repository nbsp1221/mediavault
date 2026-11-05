import type { LibraryVideo } from '~/modules/library/domain/library-video';

export function createLibraryVideoFixture(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    createdAt: new Date('2026-11-02T00:00:00Z'),
    duration: 1,
    id: 'video-1',
    ownerId: 'owner-1',
    tags: [],
    title: 'Playback security fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    visibility: 'public',
    ...overrides,
  };
}

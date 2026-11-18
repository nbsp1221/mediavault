import type { PlaybackCatalogVideo } from '../ports/video-catalog.port';

export function findRelatedVideos(
  current: PlaybackCatalogVideo,
  allVideos: PlaybackCatalogVideo[],
) {
  if (current.tags.length === 0) {
    return [];
  }
  const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()));
  return allVideos
    .filter((candidate) => candidate.id !== current.id)
    .filter((candidate) => candidate.tags.some((tag) => currentTags.has(tag.toLowerCase())))
    .slice(0, 10);
}

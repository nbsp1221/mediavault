import { useMemo, useState } from 'react';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';

export interface PlayerSurfaceTagItem {
  isActive: boolean;
  value: string;
}

export interface PlayerSurfaceRelatedVideoItem extends PlaybackCatalogVideo {
  durationLabel: string;
  visibleTags: string[];
}

interface UsePlayerSurfaceViewInput {
  relatedVideos: PlaybackCatalogVideo[];
  video: PlaybackCatalogVideo;
}

interface ActiveTagState {
  sourceVideoId: string;
  value: string | null;
}

export function usePlayerSurfaceView(input: UsePlayerSurfaceViewInput) {
  const [activeTagState, setActiveTagState] = useState<ActiveTagState>({
    sourceVideoId: input.video.id,
    value: null,
  });

  const activeTag = activeTagState.sourceVideoId === input.video.id ? activeTagState.value : null;

  const filteredRelatedVideos = useMemo(() => {
    if (!activeTag) {
      return input.relatedVideos;
    }

    const normalizedTag = activeTag.toLowerCase();
    return input.relatedVideos.filter((candidate) =>
      candidate.tags.some((tag) => tag.toLowerCase() === normalizedTag),
    );
  }, [activeTag, input.relatedVideos]);

  const relatedVideoItems = useMemo<PlayerSurfaceRelatedVideoItem[]>(() => {
    return filteredRelatedVideos.map((video) => ({
      ...video,
      durationLabel: formatDuration(video.duration),
      visibleTags: video.tags.slice(0, 2),
    }));
  }, [filteredRelatedVideos]);

  const tagItems = useMemo<PlayerSurfaceTagItem[]>(() => {
    return input.video.tags.map((tag) => ({
      isActive: activeTag?.toLowerCase() === tag.toLowerCase(),
      value: tag,
    }));
  }, [activeTag, input.video.tags]);

  const toggleTagFilter = (tag: string) => {
    setActiveTagState((prev) => ({
      sourceVideoId: input.video.id,
      value:
        prev.sourceVideoId === input.video.id && prev.value?.toLowerCase() === tag.toLowerCase()
          ? null
          : tag,
    }));
  };

  const clearTagFilter = () => {
    setActiveTagState({
      sourceVideoId: input.video.id,
      value: null,
    });
  };

  return {
    activeTag,
    clearTagFilter,
    createdAtLabel: formatDisplayDate(input.video.createdAt),
    durationLabel: formatDuration(input.video.duration),
    filteredRelatedVideos: relatedVideoItems,
    hasTagFilter: Boolean(activeTag),
    relatedEmptyMessage: activeTag
      ? `No related videos match #${activeTag}. Clear the filter to see more from the vault.`
      : 'No related videos available yet.',
    tagItems,
    toggleTagFilter,
  };
}

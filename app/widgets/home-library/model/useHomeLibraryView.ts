import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import { type HomeLibraryVideoActions, useHomeLibraryVideoActions } from '~/features/home-library-video-actions/model/useHomeLibraryVideoActions';
import { doesLibraryVideoMatchHomeFilters } from '~/modules/library/domain/library-home-filters';
import {
  type HomeLibraryFilters,
  areHomeLibraryFiltersEqual,
  createHomeLibraryFilters,
  toLibraryHomeFilters,
} from './home-library-filters';

interface UseHomeLibraryViewOptions {
  initialVideos: HomeLibraryVideo[];
  initialFilters?: Partial<HomeLibraryFilters>;
  videoActions?: Pick<HomeLibraryVideoActions, 'deleteVideo'>;
}

function createVideoSnapshotKey(video: HomeLibraryVideo) {
  return JSON.stringify({
    contentTypeSlug: video.contentTypeSlug,
    createdAt: video.createdAt.getTime(),
    description: video.description,
    duration: video.duration,
    genreSlugs: video.genreSlugs ?? [],
    id: video.id,
    isPrivate: video.isPrivate,
    permissions: video.permissions,
    tags: video.tags,
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    videoUrl: video.videoUrl,
  });
}

function createVideoListSnapshotKey(videos: HomeLibraryVideo[]) {
  return videos.map(createVideoSnapshotKey).join('\n');
}

function areVideoSnapshotsEqual(a: HomeLibraryVideo[], b: HomeLibraryVideo[]) {
  return createVideoListSnapshotKey(a) === createVideoListSnapshotKey(b);
}

export function useHomeLibraryView({
  initialVideos,
  initialFilters,
  videoActions,
}: UseHomeLibraryViewOptions) {
  const defaultVideoActions = useHomeLibraryVideoActions();
  const actions = videoActions ?? defaultVideoActions;
  const previousInitialFiltersRef = useRef<HomeLibraryFilters>(createHomeLibraryFilters(initialFilters));
  const previousInitialVideosRef = useRef<HomeLibraryVideo[]>(initialVideos);
  const [videos, setVideos] = useState<HomeLibraryVideo[]>(initialVideos);
  const [searchFilters, setSearchFilters] = useState<HomeLibraryFilters>(() => createHomeLibraryFilters(initialFilters));

  const filteredVideos = useMemo(() => {
    const domainFilters = toLibraryHomeFilters(searchFilters);

    return videos.filter(video => doesLibraryVideoMatchHomeFilters(video, domainFilters));
  }, [searchFilters, videos]);

  const replaceSearchFilters = (nextFilters: HomeLibraryFilters) => {
    setSearchFilters(prevFilters => (areHomeLibraryFiltersEqual(prevFilters, nextFilters) ? prevFilters : nextFilters));
  };

  const handleDeleteVideo = async (video: HomeLibraryVideo) => {
    if (!video.permissions.canDelete) {
      throw new Error('Video cannot be deleted by this viewer');
    }

    await actions.deleteVideo(video);
    setVideos(prev => prev.filter(candidate => candidate.id !== video.id));
  };

  useEffect(() => {
    if (areVideoSnapshotsEqual(previousInitialVideosRef.current, initialVideos)) {
      return;
    }

    previousInitialVideosRef.current = initialVideos;
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    const nextFilters = createHomeLibraryFilters(initialFilters);

    if (areHomeLibraryFiltersEqual(previousInitialFiltersRef.current, nextFilters)) {
      return;
    }

    previousInitialFiltersRef.current = nextFilters;
    setSearchFilters(prevFilters => (areHomeLibraryFiltersEqual(prevFilters, nextFilters) ? prevFilters : nextFilters));
  }, [initialFilters]);

  return {
    videos: filteredVideos,
    totalVideosCount: videos.length,
    searchFilters,
    replaceSearchFilters,
    handleDeleteVideo,
  };
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { HomeLibraryModalState } from '~/features/home-quick-view/ui/HomeQuickViewDialog';
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
  videoActions?: HomeLibraryVideoActions;
}

interface UpdateVideoPayload {
  contentTypeSlug?: string | null;
  title: string;
  tags: string[];
  genreSlugs: string[];
  description?: string;
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

function createClosedModalState(): HomeLibraryModalState {
  return {
    video: null,
    isOpen: false,
  };
}

function syncModalStateAfterCanonicalVideoUpdate(
  modalState: HomeLibraryModalState,
  updatedVideo: HomeLibraryVideo,
): HomeLibraryModalState {
  if (modalState.video?.id !== updatedVideo.id) {
    return modalState;
  }

  return {
    isOpen: true,
    video: updatedVideo,
  };
}

function syncModalStateAfterCanonicalVideoListUpdate(
  modalState: HomeLibraryModalState,
  nextVideos: HomeLibraryVideo[],
): HomeLibraryModalState {
  const openVideoId = modalState.video?.id;

  if (!modalState.isOpen || !openVideoId) {
    return modalState;
  }

  const nextVideo = nextVideos.find(video => video.id === openVideoId);

  return nextVideo
    ? {
        isOpen: true,
        video: nextVideo,
      }
    : createClosedModalState();
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
  const [modalState, setModalState] = useState<HomeLibraryModalState>(createClosedModalState);

  const filteredVideos = useMemo(() => {
    const domainFilters = toLibraryHomeFilters(searchFilters);

    return videos.filter(video => doesLibraryVideoMatchHomeFilters(video, domainFilters));
  }, [searchFilters, videos]);

  const replaceSearchFilters = (nextFilters: HomeLibraryFilters) => {
    setSearchFilters(prevFilters => (areHomeLibraryFiltersEqual(prevFilters, nextFilters) ? prevFilters : nextFilters));
  };

  const handleQuickView = (video: HomeLibraryVideo) => {
    setModalState({
      video,
      isOpen: true,
    });
  };

  const handleCloseModal = () => {
    setModalState(createClosedModalState());
  };

  const handleDeleteVideo = async (video: HomeLibraryVideo) => {
    if (!video.permissions.canDelete) {
      throw new Error('Video cannot be deleted by this viewer');
    }

    await actions.deleteVideo(video);
    setVideos(prev => prev.filter(candidate => candidate.id !== video.id));
    setModalState(prev => (prev.video?.id === video.id ? createClosedModalState() : prev));
  };

  const handleUpdateVideo = async (video: HomeLibraryVideo, updates: UpdateVideoPayload) => {
    if (!video.permissions.canEdit) {
      throw new Error('Video cannot be edited by this viewer');
    }

    const updatedVideo = await actions.updateVideo(video, updates);
    setVideos(prev => prev.map(candidate => (candidate.id === video.id ? updatedVideo : candidate)));
    setModalState(prev => syncModalStateAfterCanonicalVideoUpdate(prev, updatedVideo));
  };

  useEffect(() => {
    if (areVideoSnapshotsEqual(previousInitialVideosRef.current, initialVideos)) {
      return;
    }

    previousInitialVideosRef.current = initialVideos;
    setVideos(initialVideos);
    setModalState(prev => syncModalStateAfterCanonicalVideoListUpdate(prev, initialVideos));
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
    modalState,
    replaceSearchFilters,
    handleQuickView,
    handleCloseModal,
    handleDeleteVideo,
    handleUpdateVideo,
  };
}

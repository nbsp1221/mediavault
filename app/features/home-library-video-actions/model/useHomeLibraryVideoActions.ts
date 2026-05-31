import { useCallback } from 'react';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';

interface UpdateVideoPayload {
  contentTypeSlug?: string | null;
  title: string;
  tags: string[];
  genreSlugs: string[];
  description?: string;
}

interface VideoActionResult {
  error?: string;
  success?: boolean;
  video?: SerializedHomeLibraryVideo;
}

export interface HomeLibraryVideoActions {
  changeVisibility(video: HomeLibraryVideo, visibility: VideoVisibility): Promise<HomeLibraryVideo>;
  deleteVideo(video: HomeLibraryVideo): Promise<void>;
  updateVideo(video: HomeLibraryVideo, updates: UpdateVideoPayload): Promise<HomeLibraryVideo>;
}

interface SerializedHomeLibraryVideo extends Omit<HomeLibraryVideo, 'createdAt'> {
  createdAt: string | Date;
}

async function readActionError(response: Response, fallbackMessage: string) {
  try {
    const result = await response.json() as VideoActionResult;

    return result.error || fallbackMessage;
  }
  catch {
    return fallbackMessage;
  }
}

async function assertSuccessfulAction(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(await readActionError(response, fallbackMessage));
  }

  const result = await response.json() as VideoActionResult;

  if (!result.success) {
    throw new Error(result.error || fallbackMessage);
  }

  return result;
}

async function executeVideoAction(url: string, init: RequestInit, fallbackMessage: string) {
  const response = await fetch(url, init);
  return assertSuccessfulAction(response, fallbackMessage);
}

function deserializeUpdatedVideo(result: VideoActionResult, fallbackMessage: string): HomeLibraryVideo {
  if (!result.video) {
    throw new Error(fallbackMessage);
  }

  return {
    ...result.video,
    createdAt: result.video.createdAt instanceof Date
      ? result.video.createdAt
      : new Date(result.video.createdAt),
  };
}

export function useHomeLibraryVideoActions(): HomeLibraryVideoActions {
  const changeVisibility = useCallback(async (video: HomeLibraryVideo, visibility: VideoVisibility) => {
    return changeLibraryVideoVisibility(video, visibility);
  }, []);

  const deleteVideo = useCallback(async (video: HomeLibraryVideo) => {
    await deleteLibraryVideo(video);
  }, []);

  const updateVideo = useCallback(async (video: HomeLibraryVideo, updates: UpdateVideoPayload) => {
    return updateLibraryVideoMetadata(video, updates);
  }, []);

  return {
    changeVisibility,
    deleteVideo,
    updateVideo,
  };
}

export async function changeLibraryVideoVisibility(video: HomeLibraryVideo, visibility: VideoVisibility): Promise<HomeLibraryVideo> {
  if (!video.permissions.canManageVisibility) {
    throw new Error('Video visibility cannot be changed by this viewer');
  }

  const result = await executeVideoAction(`/api/visibility/${video.id}`, {
    body: JSON.stringify({ visibility }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  }, 'Visibility could not be updated. Try again.');

  return deserializeUpdatedVideo(result, 'Updated video response was incomplete');
}

export async function deleteLibraryVideo(video: HomeLibraryVideo): Promise<void> {
  if (!video.permissions.canDelete) {
    throw new Error('Video cannot be deleted by this viewer');
  }

  await executeVideoAction(`/api/delete/${video.id}`, {
    method: 'DELETE',
  }, 'Failed to delete video');
}

export async function updateLibraryVideoMetadata(
  video: HomeLibraryVideo,
  updates: UpdateVideoPayload,
): Promise<HomeLibraryVideo> {
  if (!video.permissions.canEdit) {
    throw new Error('Video cannot be edited by this viewer');
  }

  const result = await executeVideoAction(`/api/update/${video.id}`, {
    body: JSON.stringify(updates),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  }, 'Failed to update video');

  return deserializeUpdatedVideo(result, 'Updated video response was incomplete');
}

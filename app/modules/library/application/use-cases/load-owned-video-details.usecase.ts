import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { VideoTaxonomyItem } from '../../domain/video-taxonomy';
import type { LibraryVideoReadPort } from '../ports/library-video-read.port';
import { VideoAccessPolicy } from '../../domain/policies/video-access.policy';
import { createVideoReadAccessScope } from '../policies/video-read-access-scope';

interface LoadOwnedVideoDetailsInput {
  viewer: VideoViewer;
  videoId: string;
}

interface LoadOwnedVideoDetailsSuccess {
  ok: true;
  data: {
    contentTypes: VideoTaxonomyItem[];
    genres: VideoTaxonomyItem[];
    video: LibraryVideo;
  };
}

interface LoadOwnedVideoDetailsFailure {
  ok: false;
  message: string;
  reason:
    | 'INVALID_INPUT'
    | 'VIDEO_DETAILS_SOURCE_UNAVAILABLE'
    | 'VIDEO_NOT_FOUND';
}

export type LoadOwnedVideoDetailsResult =
  | LoadOwnedVideoDetailsSuccess
  | LoadOwnedVideoDetailsFailure;

interface VideoMetadataVocabularySource {
  listActiveContentTypes(): Promise<VideoTaxonomyItem[]>;
  listActiveGenres(): Promise<VideoTaxonomyItem[]>;
}

interface LoadOwnedVideoDetailsUseCaseDependencies {
  videoRead: LibraryVideoReadPort;
  vocabularySource: VideoMetadataVocabularySource;
}

const videoNotFoundResult: LoadOwnedVideoDetailsFailure = {
  message: 'Video not found',
  ok: false,
  reason: 'VIDEO_NOT_FOUND',
};

export class LoadOwnedVideoDetailsUseCase {
  constructor(
    private readonly deps: LoadOwnedVideoDetailsUseCaseDependencies,
  ) {}

  async execute(input: LoadOwnedVideoDetailsInput): Promise<LoadOwnedVideoDetailsResult> {
    const videoId = typeof input.videoId === 'string' ? input.videoId.trim() : '';

    if (!videoId) {
      return {
        message: 'Video ID is required',
        ok: false,
        reason: 'INVALID_INPUT',
      };
    }

    if (input.viewer.type !== 'authenticated') {
      return videoNotFoundResult;
    }

    try {
      const video = await this.deps.videoRead.findLibraryVideoById(
        videoId,
        createVideoReadAccessScope(input.viewer),
      );

      if (!video || !canManageVideoDetails(input.viewer, video)) {
        return videoNotFoundResult;
      }

      const [contentTypes, genres] = await Promise.all([
        this.deps.vocabularySource.listActiveContentTypes(),
        this.deps.vocabularySource.listActiveGenres(),
      ]);

      return {
        data: {
          contentTypes,
          genres,
          video,
        },
        ok: true,
      };
    }
    catch {
      return {
        message: 'Video details could not be loaded',
        ok: false,
        reason: 'VIDEO_DETAILS_SOURCE_UNAVAILABLE',
      };
    }
  }
}

function canManageVideoDetails(viewer: VideoViewer, video: LibraryVideo) {
  return VideoAccessPolicy.evaluate({
    operation: 'edit',
    ownerId: video.ownerId,
    viewer,
    visibility: video.visibility,
  }).allowed;
}

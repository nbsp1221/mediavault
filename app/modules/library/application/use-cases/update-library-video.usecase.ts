import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { UpdateLibraryVideoInput as UpdateLibraryVideoMutationInput } from '../ports/library-video-mutation.port';
import type { LibraryVideoMutationPort } from '../ports/library-video-mutation.port';
import { VideoAccessPolicy } from '../../domain/policies/video-access.policy';
import { normalizeVideoTags } from '../../domain/video-tag';
import { normalizeTaxonomySlug, normalizeTaxonomySlugs } from '../../domain/video-taxonomy';

export interface UpdateLibraryVideoInput {
  contentTypeSlug?: unknown;
  description?: unknown;
  genreSlugs?: unknown;
  tags?: unknown;
  title?: unknown;
  viewer: VideoViewer;
  videoId: string;
}

interface UpdateLibraryVideoSuccess {
  ok: true;
  data: {
    message: string;
    video: LibraryVideo;
  };
}

interface UpdateLibraryVideoFailure {
  ok: false;
  reason: 'INVALID_INPUT' | 'VIDEO_NOT_FOUND' | 'UPDATE_FAILED';
  message: string;
}

export type UpdateLibraryVideoUseCaseResult =
  | UpdateLibraryVideoSuccess
  | UpdateLibraryVideoFailure;

interface UpdateLibraryVideoUseCaseDependencies {
  videoMutation: LibraryVideoMutationPort;
}

function sanitizeTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return normalizeVideoTags(tags.filter(tag => typeof tag === 'string'));
}

function sanitizeGenreSlugs(genreSlugs: unknown) {
  if (!Array.isArray(genreSlugs)) {
    return undefined;
  }

  return normalizeTaxonomySlugs(genreSlugs.filter(slug => typeof slug === 'string'));
}

function sanitizeContentTypeSlug(contentTypeSlug: unknown) {
  if (contentTypeSlug === null) {
    return null;
  }

  if (typeof contentTypeSlug !== 'string') {
    return undefined;
  }

  return normalizeTaxonomySlug(contentTypeSlug) ?? null;
}

function sanitizeDescription(description: unknown) {
  if (typeof description !== 'string') {
    return undefined;
  }

  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function copyPresentStructuredMetadataFields(
  input: UpdateLibraryVideoInput,
  mutationInput: UpdateLibraryVideoMutationInput,
) {
  if (Object.hasOwn(input, 'contentTypeSlug')) {
    const contentTypeSlug = sanitizeContentTypeSlug(input.contentTypeSlug);
    if (typeof contentTypeSlug !== 'undefined') {
      mutationInput.contentTypeSlug = contentTypeSlug;
    }
  }

  if (Object.hasOwn(input, 'genreSlugs')) {
    const genreSlugs = sanitizeGenreSlugs(input.genreSlugs);
    if (genreSlugs) {
      mutationInput.genreSlugs = genreSlugs;
    }
  }
}

function canUpdateVideo(input: {
  existingVideo: LibraryVideo;
  viewer: VideoViewer;
}) {
  return VideoAccessPolicy.evaluate({
    operation: 'edit',
    ownerId: input.existingVideo.ownerId,
    viewer: input.viewer,
    visibility: input.existingVideo.visibility,
  }).allowed;
}

export class UpdateLibraryVideoUseCase {
  constructor(
    private readonly deps: UpdateLibraryVideoUseCaseDependencies,
  ) {}

  async execute(input: UpdateLibraryVideoInput): Promise<UpdateLibraryVideoUseCaseResult> {
    const videoId = input.videoId.trim();
    const title = typeof input.title === 'string'
      ? input.title.trim()
      : '';

    if (videoId.length === 0) {
      return {
        message: 'Video ID is required',
        ok: false,
        reason: 'INVALID_INPUT',
      };
    }

    if (title.length === 0) {
      return {
        message: 'Title is required',
        ok: false,
        reason: 'INVALID_INPUT',
      };
    }

    if (input.viewer.type !== 'authenticated') {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    const existingVideo = await this.deps.videoMutation.findOwnedLibraryVideoById({
      ownerId: input.viewer.userId,
      videoId,
    });

    if (!existingVideo) {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    if (!canUpdateVideo({ existingVideo, viewer: input.viewer })) {
      return {
        message: 'Video not found',
        ok: false,
        reason: 'VIDEO_NOT_FOUND',
      };
    }

    const mutationInput: UpdateLibraryVideoMutationInput = {
      description: sanitizeDescription(input.description),
      tags: sanitizeTags(input.tags),
      title,
      videoId,
    };

    copyPresentStructuredMetadataFields(input, mutationInput);

    const updatedVideo = await this.deps.videoMutation.updateLibraryVideo(mutationInput);

    if (!updatedVideo) {
      return {
        message: 'Failed to update video',
        ok: false,
        reason: 'UPDATE_FAILED',
      };
    }

    return {
      data: {
        message: `Video "${updatedVideo.title}" updated successfully`,
        video: updatedVideo,
      },
      ok: true,
    };
  }
}

import type { LibraryVideoMutationPort } from '~/modules/library/application/ports/library-video-mutation.port';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';
import { SqliteLibraryVideoMetadataRepository } from './sqlite-library-video-metadata.repository';

type SqliteLibraryVideoMutationAdapterRepository = Pick<
  SqliteLibraryVideoMetadataRepository,
  'delete' | 'findById' | 'findOwnedById' | 'update' | 'updateVisibility'
>;

interface SqliteLibraryVideoMutationAdapterDependencies {
  repository?: SqliteLibraryVideoMutationAdapterRepository;
}

type UpdateLibraryVideoInput = Parameters<LibraryVideoMutationPort['updateLibraryVideo']>[0];
type RepositoryUpdateInput = Parameters<SqliteLibraryVideoMutationAdapterRepository['update']>[1];

function copyPresentStructuredMetadataFields(
  input: UpdateLibraryVideoInput,
  updates: RepositoryUpdateInput,
) {
  if (Object.hasOwn(input, 'contentTypeSlug') && typeof input.contentTypeSlug !== 'undefined') {
    updates.contentTypeSlug = input.contentTypeSlug;
  }

  if (Object.hasOwn(input, 'genreSlugs')) {
    updates.genreSlugs = input.genreSlugs;
  }
}

export class SqliteLibraryVideoMutationAdapter implements LibraryVideoMutationPort {
  private readonly repository: SqliteLibraryVideoMutationAdapterRepository;

  constructor(deps: SqliteLibraryVideoMutationAdapterDependencies = {}) {
    this.repository = deps.repository ?? new SqliteLibraryVideoMetadataRepository({
      dbPath: getPrimaryStorageConfig().databasePath,
    });
  }

  async deleteLibraryVideo({ videoId }: { videoId: string }) {
    const existingVideo = await this.repository.findById(videoId);

    if (!existingVideo) {
      return { deleted: false };
    }

    const deleted = await this.repository.delete(videoId);

    if (!deleted) {
      return { deleted: false, title: existingVideo.title };
    }

    return {
      deleted: true,
      title: existingVideo.title,
    };
  }

  async findOwnedLibraryVideoById(input: { ownerId: string; videoId: string }) {
    return this.repository.findOwnedById(input.videoId, input.ownerId);
  }

  async resolveVisibilityManagementTarget(input: { requesterId: string; videoId: string }) {
    const video = await this.repository.findById(input.videoId);

    if (!video) {
      return { type: 'not_found_or_private_inaccessible' as const };
    }

    if (video.ownerId === input.requesterId) {
      return {
        type: 'owned' as const,
        video,
      };
    }

    if (video.visibility === 'public') {
      return { type: 'public_non_owner' as const };
    }

    return { type: 'not_found_or_private_inaccessible' as const };
  }

  async updateLibraryVideo(input: UpdateLibraryVideoInput) {
    const updates: RepositoryUpdateInput = {
      description: input.description,
      tags: input.tags,
      title: input.title,
    };

    copyPresentStructuredMetadataFields(input, updates);

    return this.repository.update(input.videoId, updates);
  }

  async updateLibraryVideoVisibility(input: { ownerId: string; videoId: string; visibility: 'private' | 'public' }) {
    return this.repository.updateVisibility(input.videoId, input.ownerId, input.visibility);
  }
}

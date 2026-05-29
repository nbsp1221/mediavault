import type { LibraryVideo } from '../../domain/library-video';
import type { VideoVisibility } from '../../domain/value-objects/video-visibility';

export interface UpdateLibraryVideoInput {
  contentTypeSlug?: string | null;
  description?: string;
  genreSlugs?: string[];
  tags: string[];
  title: string;
  videoId: string;
}

export interface DeleteLibraryVideoResult {
  deleted: boolean;
  title?: string;
}

export type VisibilityManagementTarget =
  | { type: 'owned'; video: LibraryVideo }
  | { type: 'public_non_owner' }
  | { type: 'not_found_or_private_inaccessible' };

export interface LibraryVideoMutationPort {
  deleteLibraryVideo(input: { videoId: string }): Promise<DeleteLibraryVideoResult>;
  findOwnedLibraryVideoById(input: { ownerId: string; videoId: string }): Promise<LibraryVideo | null>;
  updateLibraryVideo(input: UpdateLibraryVideoInput): Promise<LibraryVideo | null>;
}

export interface LibraryVideoVisibilityMutationPort extends LibraryVideoMutationPort {
  resolveVisibilityManagementTarget(input: { requesterId: string; videoId: string }): Promise<VisibilityManagementTarget>;
  updateLibraryVideoVisibility(input: {
    ownerId: string;
    videoId: string;
    visibility: VideoVisibility;
  }): Promise<LibraryVideo | null>;
}

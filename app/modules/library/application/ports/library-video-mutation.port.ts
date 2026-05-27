import type { LibraryVideo } from '../../domain/library-video';

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

export interface LibraryVideoMutationPort {
  deleteLibraryVideo(input: { videoId: string }): Promise<DeleteLibraryVideoResult>;
  findOwnedLibraryVideoById(input: { ownerId: string; videoId: string }): Promise<LibraryVideo | null>;
  updateLibraryVideo(input: UpdateLibraryVideoInput): Promise<LibraryVideo | null>;
}

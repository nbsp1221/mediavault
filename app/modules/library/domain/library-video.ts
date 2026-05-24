export interface LibraryVideo {
  contentTypeSlug?: string;
  id: string;
  ownerId: string;
  title: string;
  tags: string[];
  genreSlugs?: string[];
  thumbnailUrl?: string;
  videoUrl: string;
  visibility: 'private' | 'public';
  duration: number;
  createdAt: Date;
  description?: string;
}

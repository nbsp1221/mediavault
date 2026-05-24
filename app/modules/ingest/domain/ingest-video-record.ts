export interface IngestVideoRecord {
  contentTypeSlug?: string;
  id: string;
  ownerId: string;
  title: string;
  tags: string[];
  genreSlugs: string[];
  videoUrl: string;
  thumbnailUrl: string;
  visibility: 'private' | 'public';
  duration: number;
  description?: string;
}

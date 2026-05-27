export interface HomeLibraryVideoPermissions {
  canDelete: boolean;
  canEdit: boolean;
  canManageVisibility: boolean;
}

export interface HomeLibraryVideo {
  contentTypeSlug?: string;
  id: string;
  isPrivate: boolean;
  permissions: HomeLibraryVideoPermissions;
  title: string;
  tags: string[];
  genreSlugs?: string[];
  thumbnailUrl?: string;
  videoUrl: string;
  duration: number;
  createdAt: Date;
  description?: string;
}

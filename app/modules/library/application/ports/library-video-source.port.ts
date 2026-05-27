import type { LibraryVideo } from '../../domain/library-video';
import type { VideoTaxonomyItem } from '../../domain/video-taxonomy';
import type { VideoReadAccessScope } from '../policies/video-read-access-scope';

export interface LibraryVideoSourcePort {
  listActiveContentTypes(): Promise<VideoTaxonomyItem[]>;
  listActiveGenres(): Promise<VideoTaxonomyItem[]>;
  listLibraryVideos(scope: VideoReadAccessScope): Promise<LibraryVideo[]>;
}

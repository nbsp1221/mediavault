import type { LibraryHomeFilters } from '../../domain/library-home-filters';
import type { LibraryVideo } from '../../domain/library-video';
import type { VideoViewer } from '../../domain/policies/video-access.policy';
import type { VideoTaxonomyItem } from '../../domain/video-taxonomy';
import type { LibraryVideoSourcePort } from '../ports/library-video-source.port';
import { createLibraryHomeFilters } from '../../domain/library-home-filters';
import { createVideoReadAccessScope } from '../policies/video-read-access-scope';

interface LoadLibraryCatalogSnapshotInput {
  rawContentTypeSlug?: string | null;
  rawExcludeTags?: string[];
  rawGenreSlugs?: string[];
  rawIncludeTags?: string[];
  rawQuery?: string | null;
  viewer: VideoViewer;
}

interface LoadLibraryCatalogSnapshotSuccess {
  ok: true;
  data: {
    videos: LibraryVideo[];
    filters: LibraryHomeFilters;
    vocabulary: {
      contentTypes: VideoTaxonomyItem[];
      genres: VideoTaxonomyItem[];
    };
  };
}

interface LoadLibraryCatalogSnapshotFailure {
  ok: false;
  reason: 'CATALOG_SOURCE_UNAVAILABLE';
}

export type LoadLibraryCatalogSnapshotResult =
  | LoadLibraryCatalogSnapshotSuccess
  | LoadLibraryCatalogSnapshotFailure;

interface LoadLibraryCatalogSnapshotUseCaseDependencies {
  videoSource: LibraryVideoSourcePort;
}

export class LoadLibraryCatalogSnapshotUseCase {
  constructor(
    private readonly deps: LoadLibraryCatalogSnapshotUseCaseDependencies,
  ) {}

  async execute(input: LoadLibraryCatalogSnapshotInput): Promise<LoadLibraryCatalogSnapshotResult> {
    try {
      const readScope = createVideoReadAccessScope(input.viewer);
      const [videos, contentTypes, genres] = await Promise.all([
        this.deps.videoSource.listLibraryVideos(readScope),
        this.deps.videoSource.listActiveContentTypes(),
        this.deps.videoSource.listActiveGenres(),
      ]);

      return {
        ok: true,
        data: {
          videos,
          filters: createLibraryHomeFilters(input),
          vocabulary: {
            contentTypes,
            genres,
          },
        },
      };
    }
    catch {
      return {
        ok: false,
        reason: 'CATALOG_SOURCE_UNAVAILABLE',
      };
    }
  }
}

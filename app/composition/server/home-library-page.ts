import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { LoadLibraryCatalogSnapshotResult } from '~/modules/library/application/use-cases/load-library-catalog-snapshot.usecase';
import type { VideoViewer } from '~/modules/library/domain/policies/video-access.policy';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { toHomeLibraryVideoDto } from './home-library-video-dto';
import { getServerLibraryServices } from './library';

interface LoadHomeLibraryPageDataInput {
  rawContentTypeSlug?: string | null;
  rawExcludeTags?: string[];
  rawGenreSlugs?: string[];
  rawIncludeTags?: string[];
  rawQuery?: string | null;
  viewer: VideoViewer;
}

interface LoadHomeLibraryPageDataSuccess {
  ok: true;
  data: {
    contentTypes: VideoTaxonomyItem[];
    genres: VideoTaxonomyItem[];
    videos: HomeLibraryVideo[];
  };
}

interface LoadHomeLibraryPageDataFailure {
  ok: false;
  reason: 'HOME_DATA_UNAVAILABLE';
}

export type LoadHomeLibraryPageDataResult =
  | LoadHomeLibraryPageDataSuccess
  | LoadHomeLibraryPageDataFailure;

interface HomeLibraryPageServices {
  loadHomeLibraryPageData: {
    execute(input: LoadHomeLibraryPageDataInput): Promise<LoadHomeLibraryPageDataResult>;
  };
}

interface HomeLibraryReadServices {
  loadLibraryCatalogSnapshot: {
    execute: ReturnType<typeof getServerLibraryServices>['loadLibraryCatalogSnapshot']['execute'];
  };
}

interface HomeLibraryPageServiceDependencies {
  libraryServices: HomeLibraryReadServices;
}

let cachedHomeLibraryPageServices: HomeLibraryPageServices | null = null;

function createHomeLibraryUnavailableFailure(): LoadHomeLibraryPageDataFailure {
  return {
    ok: false,
    reason: 'HOME_DATA_UNAVAILABLE',
  };
}

function mapCatalogResultToHomePageData(
  result: Extract<LoadLibraryCatalogSnapshotResult, { ok: true }>,
  viewer: VideoViewer,
): LoadHomeLibraryPageDataSuccess {
  return {
    ok: true,
    data: {
      contentTypes: result.data.vocabulary.contentTypes,
      genres: result.data.vocabulary.genres,
      videos: result.data.videos.map(video => toHomeLibraryVideoDto(video, viewer)),
    },
  };
}

function resolveDependencies(
  overrides: Partial<HomeLibraryPageServiceDependencies>,
): HomeLibraryPageServiceDependencies {
  return {
    libraryServices: overrides.libraryServices ?? getServerLibraryServices(),
  };
}

export function createHomeLibraryPageServices(
  overrides: Partial<HomeLibraryPageServiceDependencies> = {},
): HomeLibraryPageServices {
  const deps = resolveDependencies(overrides);

  return {
    loadHomeLibraryPageData: {
      async execute(input) {
        const catalogResult = await deps.libraryServices.loadLibraryCatalogSnapshot.execute(input);

        if (!catalogResult.ok) {
          return createHomeLibraryUnavailableFailure();
        }

        return mapCatalogResultToHomePageData(catalogResult, input.viewer);
      },
    },
  };
}

export function getHomeLibraryPageServices(): HomeLibraryPageServices {
  if (cachedHomeLibraryPageServices) {
    return cachedHomeLibraryPageServices;
  }

  cachedHomeLibraryPageServices = createHomeLibraryPageServices();

  return cachedHomeLibraryPageServices;
}

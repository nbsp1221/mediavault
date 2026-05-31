import type { LibraryVideoArtifactRemovalPort } from '~/modules/library/application/ports/library-video-artifact-removal.port';
import type { LibraryVideoMutationPort, LibraryVideoVisibilityMutationPort } from '~/modules/library/application/ports/library-video-mutation.port';
import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { LibraryVideoSourcePort } from '~/modules/library/application/ports/library-video-source.port';
import { ChangeLibraryVideoVisibilityUseCase } from '~/modules/library/application/use-cases/change-library-video-visibility.usecase';
import { DeleteLibraryVideoUseCase } from '~/modules/library/application/use-cases/delete-library-video.usecase';
import { LoadLibraryCatalogSnapshotUseCase } from '~/modules/library/application/use-cases/load-library-catalog-snapshot.usecase';
import { LoadOwnedVideoDetailsUseCase } from '~/modules/library/application/use-cases/load-owned-video-details.usecase';
import { LoadVideoMetadataVocabularyUseCase } from '~/modules/library/application/use-cases/load-video-metadata-vocabulary.usecase';
import { UpdateLibraryVideoUseCase } from '~/modules/library/application/use-cases/update-library-video.usecase';
import { SqliteCanonicalVideoMetadataAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-canonical-video-metadata.adapter';
import { SqliteLibraryVideoMutationAdapter } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-mutation.adapter';
import { FilesystemLibraryVideoArtifactRemovalAdapter } from '~/modules/library/infrastructure/storage/filesystem-library-video-artifact-removal.adapter';

export interface LoadLibraryCatalogSnapshotService {
  execute: LoadLibraryCatalogSnapshotUseCase['execute'];
}

export interface ServerLibraryServices {
  changeLibraryVideoVisibility: ChangeLibraryVideoVisibilityUseCase;
  deleteLibraryVideo: DeleteLibraryVideoUseCase;
  loadLibraryCatalogSnapshot: LoadLibraryCatalogSnapshotService;
  loadOwnedVideoDetails: LoadOwnedVideoDetailsUseCase;
  loadVideoMetadataVocabulary: LoadVideoMetadataVocabularyUseCase;
  updateLibraryVideo: UpdateLibraryVideoUseCase;
}

interface ServerLibraryServiceDependencies {
  artifactRemovalPort: LibraryVideoArtifactRemovalPort;
  mutationPort: LibraryVideoMutationPort & LibraryVideoVisibilityMutationPort;
  videoRead: LibraryVideoReadPort;
  videoSource: LibraryVideoSourcePort;
}

let cachedLibraryServices: ServerLibraryServices | null = null;

function resolveDependencies(
  overrides: Partial<ServerLibraryServiceDependencies>,
): ServerLibraryServiceDependencies {
  let canonicalVideoMetadata: SqliteCanonicalVideoMetadataAdapter | null = null;
  const getCanonicalVideoMetadata = () => {
    canonicalVideoMetadata ??= new SqliteCanonicalVideoMetadataAdapter();
    return canonicalVideoMetadata;
  };

  return {
    artifactRemovalPort: overrides.artifactRemovalPort ?? new FilesystemLibraryVideoArtifactRemovalAdapter(),
    mutationPort: overrides.mutationPort ?? new SqliteLibraryVideoMutationAdapter(),
    videoRead: overrides.videoRead ?? getCanonicalVideoMetadata(),
    videoSource: overrides.videoSource ?? getCanonicalVideoMetadata(),
  };
}

export function createServerLibraryServices(
  overrides: Partial<ServerLibraryServiceDependencies> = {},
): ServerLibraryServices {
  const deps = resolveDependencies(overrides);

  return {
    changeLibraryVideoVisibility: new ChangeLibraryVideoVisibilityUseCase({
      videoMutation: deps.mutationPort,
    }),
    deleteLibraryVideo: new DeleteLibraryVideoUseCase({
      videoArtifacts: deps.artifactRemovalPort,
      videoMutation: deps.mutationPort,
    }),
    loadLibraryCatalogSnapshot: new LoadLibraryCatalogSnapshotUseCase({
      videoSource: deps.videoSource,
    }),
    loadOwnedVideoDetails: new LoadOwnedVideoDetailsUseCase({
      videoRead: deps.videoRead,
      vocabularySource: deps.videoSource,
    }),
    loadVideoMetadataVocabulary: new LoadVideoMetadataVocabularyUseCase({
      videoSource: deps.videoSource,
    }),
    updateLibraryVideo: new UpdateLibraryVideoUseCase({
      videoMutation: deps.mutationPort,
    }),
  };
}

export function getServerLibraryServices(): ServerLibraryServices {
  if (cachedLibraryServices) {
    return cachedLibraryServices;
  }

  cachedLibraryServices = createServerLibraryServices();

  return cachedLibraryServices;
}

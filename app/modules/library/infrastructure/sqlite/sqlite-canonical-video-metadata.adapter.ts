import type { LibraryVideoReadPort } from '~/modules/library/application/ports/library-video-read.port';
import type { LibraryVideoSourcePort } from '~/modules/library/application/ports/library-video-source.port';
import { SqliteLibraryVideoMetadataRepository } from '~/modules/library/infrastructure/sqlite/sqlite-library-video-metadata.repository';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';

type Repository = Pick<
  SqliteLibraryVideoMetadataRepository,
  | 'findAllByReadAccessScope'
  | 'findByIdByReadAccessScope'
  | 'listActiveContentTypes'
  | 'listActiveGenres'
>;

interface Dependencies {
  dbPath?: string;
  repository?: Repository;
}

export class SqliteCanonicalVideoMetadataAdapter
  implements LibraryVideoSourcePort, LibraryVideoReadPort
{
  private readonly repository: Repository;

  constructor(deps: Dependencies = {}) {
    this.repository =
      deps.repository ??
      new SqliteLibraryVideoMetadataRepository({
        dbPath: deps.dbPath ?? getPrimaryStorageConfig().databasePath,
      });
  }

  async listLibraryVideos(scope: Parameters<LibraryVideoSourcePort['listLibraryVideos']>[0]) {
    return this.repository.findAllByReadAccessScope(scope);
  }

  async findLibraryVideoById(
    videoId: Parameters<LibraryVideoReadPort['findLibraryVideoById']>[0],
    scope: Parameters<LibraryVideoReadPort['findLibraryVideoById']>[1],
  ) {
    return this.repository.findByIdByReadAccessScope(videoId, scope);
  }

  async listActiveContentTypes() {
    return this.repository.listActiveContentTypes();
  }

  async listActiveGenres() {
    return this.repository.listActiveGenres();
  }
}

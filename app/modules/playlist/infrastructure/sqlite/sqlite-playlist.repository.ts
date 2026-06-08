import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database';
import { type CreateMigratedPrimarySqliteDatabase, createMigratedPrimarySqliteDatabase } from '~/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';
import { getPrimaryStorageConfig } from '~/shared/config/app-config.server';
import type {
  CreatePlaylistPortInput,
  PlaylistRepositoryPort,
  UpdatePlaylistPortInput,
} from '../../application/ports/playlist-repository.port';
import type {
  Playlist,
  PlaylistFilters,
  PlaylistItem,
  PlaylistMetadata,
  PlaylistType,
} from '../../domain/playlist';

interface SqlitePlaylistRepositoryOptions {
  createDatabase?: CreateMigratedPrimarySqliteDatabase;
  dbPath?: string;
}

interface PlaylistRow {
  created_at: string;
  description: string | null;
  id: string;
  is_public: number;
  metadata_json: string | null;
  name: string;
  owner_id: string;
  thumbnail_path: string | null;
  type: PlaylistType;
  updated_at: string;
}

interface PlaylistItemRow {
  added_at: string;
  added_by: string;
  episode_metadata_json: string | null;
  playlist_id: string;
  position: number;
  video_id: string;
}

interface PlaylistVideoIdRow {
  video_id: string;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function parseJson<T>(value: string | null): T | undefined {
  return value ? JSON.parse(value) as T : undefined;
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function mapPlaylistRow(row: PlaylistRow, videoIds: string[]): Playlist {
  return {
    createdAt: new Date(row.created_at),
    description: row.description ?? undefined,
    id: row.id,
    isPublic: row.is_public === 1,
    metadata: parseJson<PlaylistMetadata>(row.metadata_json),
    name: row.name,
    ownerId: row.owner_id,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    type: row.type,
    updatedAt: new Date(row.updated_at),
    videoIds,
  };
}

function mapPlaylistItemRow(row: PlaylistItemRow): PlaylistItem {
  return {
    addedAt: new Date(row.added_at),
    addedBy: row.added_by,
    episodeMetadata: parseJson<PlaylistItem['episodeMetadata']>(row.episode_metadata_json),
    playlistId: row.playlist_id,
    position: row.position + 1,
    videoId: row.video_id,
  };
}

export class SqlitePlaylistRepository implements PlaylistRepositoryPort {
  private readonly createDatabase: CreateMigratedPrimarySqliteDatabase;
  private readonly dbPath: string;
  private databasePromise: Promise<SqliteDatabaseAdapter> | null = null;

  constructor(options: SqlitePlaylistRepositoryOptions = {}) {
    const dbPath = options.dbPath ?? getPrimaryStorageConfig().databasePath;

    mkdirSync(dirname(dbPath), { recursive: true });
    this.createDatabase = options.createDatabase ?? createMigratedPrimarySqliteDatabase;
    this.dbPath = dbPath;
  }

  private async getDatabase(): Promise<SqliteDatabaseAdapter> {
    if (!this.databasePromise) {
      this.databasePromise = this.createDatabase({ dbPath: this.dbPath });
    }

    return this.databasePromise;
  }

  private async getVideoIds(database: SqliteDatabaseAdapter, playlistId: string): Promise<string[]> {
    const rows = await database
      .prepare<PlaylistVideoIdRow>(`
        SELECT video_id
        FROM playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC
      `)
      .all(playlistId);

    return rows.map(row => row.video_id);
  }

  private async mapPlaylist(database: SqliteDatabaseAdapter, row: PlaylistRow): Promise<Playlist> {
    return mapPlaylistRow(row, await this.getVideoIds(database, row.id));
  }

  private async replacePlaylistItems(
    database: SqliteDatabaseAdapter,
    playlist: Playlist,
    overrides: Map<string, Partial<PlaylistItem>> = new Map(),
  ): Promise<void> {
    const existingRows = await database
      .prepare<PlaylistItemRow>(`
        SELECT
          playlist_id,
          video_id,
          position,
          added_at,
          added_by,
          episode_metadata_json
        FROM playlist_items
        WHERE playlist_id = ?
      `)
      .all(playlist.id);
    const existingByVideoId = new Map(existingRows.map(row => [row.video_id, row]));

    await database
      .prepare('DELETE FROM playlist_items WHERE playlist_id = ?')
      .run(playlist.id);

    for (const [index, videoId] of playlist.videoIds.entries()) {
      const existing = existingByVideoId.get(videoId);
      const override = overrides.get(videoId);

      await database
        .prepare(`
          INSERT INTO playlist_items (
            playlist_id,
            video_id,
            position,
            added_at,
            added_by,
            episode_metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          playlist.id,
          videoId,
          index,
          (override?.addedAt ?? (existing ? new Date(existing.added_at) : playlist.updatedAt)).toISOString(),
          override?.addedBy ?? existing?.added_by ?? playlist.ownerId,
          stringifyJson(override?.episodeMetadata ?? parseJson<PlaylistItem['episodeMetadata']>(existing?.episode_metadata_json ?? null)),
        );
    }
  }

  async addVideoToPlaylist(
    playlistId: string,
    videoId: string,
    position?: number,
    episodeMetadata?: PlaylistItem['episodeMetadata'],
  ): Promise<void> {
    const database = await this.getDatabase();

    await database.transaction(async (transactionDatabase) => {
      const playlist = await this.findByIdWithDatabase(transactionDatabase, playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID "${playlistId}" not found`);
      }

      if (playlist.videoIds.includes(videoId)) {
        throw new Error(`Video "${videoId}" is already in playlist "${playlistId}"`);
      }

      const nextIds = [...playlist.videoIds];

      if (position !== undefined && position >= 0 && position <= nextIds.length) {
        nextIds.splice(position, 0, videoId);
      }
      else {
        nextIds.push(videoId);
      }

      const updated = {
        ...playlist,
        updatedAt: new Date(),
        videoIds: nextIds,
      };
      await this.updatePlaylistRow(transactionDatabase, updated);
      await this.replacePlaylistItems(
        transactionDatabase,
        updated,
        new Map([
          [
            videoId,
            {
              addedAt: new Date(),
              addedBy: updated.ownerId,
              episodeMetadata,
            },
          ],
        ]),
      );
    });
  }

  async create(input: CreatePlaylistPortInput): Promise<Playlist> {
    const database = await this.getDatabase();
    const now = new Date();
    const playlist: Playlist = {
      createdAt: now,
      description: input.description,
      id: randomUUID(),
      isPublic: input.isPublic,
      metadata: input.metadata,
      name: input.name,
      ownerId: input.ownerId,
      thumbnailUrl: input.thumbnailUrl,
      type: input.type,
      updatedAt: now,
      videoIds: input.videoIds ?? [],
    };

    await database.transaction(async (transactionDatabase) => {
      await transactionDatabase
        .prepare(`
          INSERT INTO playlists (
            id,
            owner_id,
            name,
            name_key,
            description,
            type,
            is_public,
            thumbnail_path,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          playlist.id,
          playlist.ownerId,
          playlist.name,
          nameKey(playlist.name),
          playlist.description ?? null,
          playlist.type,
          playlist.isPublic ? 1 : 0,
          playlist.thumbnailUrl ?? null,
          stringifyJson(playlist.metadata),
          playlist.createdAt.toISOString(),
          playlist.updatedAt.toISOString(),
        );

      await this.replacePlaylistItems(transactionDatabase, playlist);
    });

    return playlist;
  }

  async delete(id: string): Promise<boolean> {
    const database = await this.getDatabase();
    const result = await database
      .prepare('DELETE FROM playlists WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  async findById(id: string): Promise<Playlist | null> {
    const database = await this.getDatabase();
    return this.findByIdWithDatabase(database, id);
  }

  private async findByIdWithDatabase(database: SqliteDatabaseAdapter, id: string): Promise<Playlist | null> {
    const row = await database
      .prepare<PlaylistRow>(`
        SELECT
          id,
          owner_id,
          name,
          description,
          type,
          is_public,
          thumbnail_path,
          metadata_json,
          created_at,
          updated_at
        FROM playlists
        WHERE id = ?
      `)
      .get(id);

    return row ? this.mapPlaylist(database, row) : null;
  }

  async findBySeries(seriesName: string): Promise<Playlist[]> {
    const database = await this.getDatabase();
    const rows = await database
      .prepare<PlaylistRow>(`
        SELECT
          id,
          owner_id,
          name,
          description,
          type,
          is_public,
          thumbnail_path,
          metadata_json,
          created_at,
          updated_at
        FROM playlists
        WHERE lower(json_extract(metadata_json, '$.seriesName')) = lower(?)
        ORDER BY created_at DESC, id ASC
      `)
      .all(seriesName);

    return Promise.all(rows.map(row => this.mapPlaylist(database, row)));
  }

  async findWithFilters(filters: PlaylistFilters): Promise<Playlist[]> {
    const database = await this.getDatabase();
    const rows = await database
      .prepare<PlaylistRow>(`
        SELECT
          id,
          owner_id,
          name,
          description,
          type,
          is_public,
          thumbnail_path,
          metadata_json,
          created_at,
          updated_at
        FROM playlists
        ORDER BY created_at DESC, id ASC
      `)
      .all();
    const playlists = await Promise.all(rows.map(row => this.mapPlaylist(database, row)));

    return playlists.filter((playlist) => {
      if (filters.type && playlist.type !== filters.type) {
        return false;
      }

      if (filters.ownerId && playlist.ownerId !== filters.ownerId) {
        return false;
      }

      if (filters.isPublic !== undefined && playlist.isPublic !== filters.isPublic) {
        return false;
      }

      if (filters.genre?.length) {
        const genres = playlist.metadata?.genre ?? [];
        if (!genres.some(genre => filters.genre!.includes(genre))) {
          return false;
        }
      }

      if (filters.seriesName && playlist.metadata?.seriesName !== filters.seriesName) {
        return false;
      }

      if (filters.status && playlist.metadata?.status !== filters.status) {
        return false;
      }

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matches = [
          playlist.name,
          playlist.description ?? '',
          ...(playlist.metadata?.genre ?? []),
        ].some(value => value.toLowerCase().includes(query));

        if (!matches) {
          return false;
        }
      }

      return true;
    });
  }

  async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    const database = await this.getDatabase();
    const rows = await database
      .prepare<PlaylistItemRow>(`
        SELECT
          playlist_id,
          video_id,
          position,
          added_at,
          added_by,
          episode_metadata_json
        FROM playlist_items
        WHERE playlist_id = ?
        ORDER BY position ASC
      `)
      .all(playlistId);

    return rows.map(mapPlaylistItemRow);
  }

  async nameExistsForOwner(name: string, ownerId: string, excludeId?: string): Promise<boolean> {
    const database = await this.getDatabase();
    const row = await database
      .prepare<{ id: string }>(`
        SELECT id
        FROM playlists
        WHERE owner_id = ?
          AND name_key = ?
          AND (? IS NULL OR id != ?)
        LIMIT 1
      `)
      .get(ownerId, nameKey(name), excludeId ?? null, excludeId ?? null);

    return row !== undefined;
  }

  async removeVideoFromPlaylist(playlistId: string, videoId: string): Promise<void> {
    const database = await this.getDatabase();

    await database.transaction(async (transactionDatabase) => {
      const playlist = await this.findByIdWithDatabase(transactionDatabase, playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID "${playlistId}" not found`);
      }

      if (!playlist.videoIds.includes(videoId)) {
        throw new Error(`Video "${videoId}" not found in playlist "${playlistId}"`);
      }

      const updated = {
        ...playlist,
        updatedAt: new Date(),
        videoIds: playlist.videoIds.filter(id => id !== videoId),
      };
      await this.updatePlaylistRow(transactionDatabase, updated);
      await this.replacePlaylistItems(transactionDatabase, updated);
    });
  }

  async reorderPlaylistItems(playlistId: string, newOrder: string[]): Promise<void> {
    const database = await this.getDatabase();

    await database.transaction(async (transactionDatabase) => {
      const playlist = await this.findByIdWithDatabase(transactionDatabase, playlistId);

      if (!playlist) {
        throw new Error(`Playlist with ID "${playlistId}" not found`);
      }

      const currentSet = new Set(playlist.videoIds);
      const nextSet = new Set(newOrder);

      if (currentSet.size !== nextSet.size || [...currentSet].some(videoId => !nextSet.has(videoId))) {
        throw new Error('New order must contain exactly the same videos as current playlist');
      }

      const updated = {
        ...playlist,
        updatedAt: new Date(),
        videoIds: [...newOrder],
      };
      await this.updatePlaylistRow(transactionDatabase, updated);
      await this.replacePlaylistItems(transactionDatabase, updated);
    });
  }

  async update(id: string, updates: UpdatePlaylistPortInput): Promise<Playlist | null> {
    const database = await this.getDatabase();

    return database.transaction(async (transactionDatabase) => {
      const playlist = await this.findByIdWithDatabase(transactionDatabase, id);

      if (!playlist) {
        return null;
      }

      const updated: Playlist = {
        ...playlist,
        ...updates,
        id: playlist.id,
        updatedAt: new Date(),
        videoIds: updates.videoIds ?? playlist.videoIds,
      };

      await this.updatePlaylistRow(transactionDatabase, updated);

      if (updates.videoIds !== undefined) {
        await this.replacePlaylistItems(transactionDatabase, updated);
      }

      return updated;
    });
  }

  private async updatePlaylistRow(database: SqliteDatabaseAdapter, playlist: Playlist): Promise<void> {
    await database
      .prepare(`
        UPDATE playlists
        SET
          owner_id = ?,
          name = ?,
          name_key = ?,
          description = ?,
          type = ?,
          is_public = ?,
          thumbnail_path = ?,
          metadata_json = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        playlist.ownerId,
        playlist.name,
        nameKey(playlist.name),
        playlist.description ?? null,
        playlist.type,
        playlist.isPublic ? 1 : 0,
        playlist.thumbnailUrl ?? null,
        stringifyJson(playlist.metadata),
        playlist.updatedAt.toISOString(),
        playlist.id,
      );
  }
}

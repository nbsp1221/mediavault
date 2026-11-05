import { describe, expect, test, vi } from 'vitest';
import type { Playlist } from '../../domain/playlist';
import type { PlaylistRepositoryPort } from '../ports/playlist-repository.port';
import type { PlaylistVideoCatalogPort } from '../ports/playlist-video-catalog.port';
import { type CreatePlaylistInput, CreatePlaylistUseCase } from './create-playlist.usecase';
import { type UpdatePlaylistInput, UpdatePlaylistUseCase } from './update-playlist.usecase';

function storedPlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'playlist-owned',
    name: 'Original',
    ownerId: 'owner-1',
    type: 'user_created',
    description: 'Original description',
    isPublic: false,
    videoIds: ['video-1'],
    metadata: { seriesName: 'Saga', genre: ['drama'], year: 2025 },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  };
}

function setupCreate() {
  const create = vi.fn<PlaylistRepositoryPort['create']>().mockImplementation(async (input) => ({
    ...storedPlaylist(),
    ...input,
    id: 'created-id',
    videoIds: input.videoIds ?? [],
  }));
  const nameExistsForOwner = vi
    .fn<PlaylistRepositoryPort['nameExistsForOwner']>()
    .mockResolvedValue(false);
  const findById = vi
    .fn<PlaylistVideoCatalogPort['findById']>()
    .mockImplementation(async (id) => ({ id, title: id, duration: 10 }));
  return {
    create,
    nameExistsForOwner,
    findById,
    useCase: new CreatePlaylistUseCase({
      playlistRepository: { create, nameExistsForOwner },
      videoCatalog: { findById },
    }),
  };
}

function creation(overrides: Partial<CreatePlaylistInput> = {}): CreatePlaylistInput {
  return { name: 'New playlist', ownerId: 'owner-1', type: 'user_created', ...overrides };
}

function setupUpdate(playlist = storedPlaylist()) {
  const findById = vi.fn<PlaylistRepositoryPort['findById']>().mockResolvedValue(playlist);
  const nameExistsForOwner = vi
    .fn<PlaylistRepositoryPort['nameExistsForOwner']>()
    .mockResolvedValue(false);
  const update = vi
    .fn<PlaylistRepositoryPort['update']>()
    .mockImplementation(async (_id, patch) => ({ ...playlist, ...patch }));
  return {
    findById,
    nameExistsForOwner,
    update,
    useCase: new UpdatePlaylistUseCase({
      playlistRepository: { findById, nameExistsForOwner, update },
    }),
  };
}

const updateIdentity = { ownerId: 'owner-1', playlistId: 'playlist-owned' };

describe('playlist creation validation and publication', () => {
  test.each([
    { label: 'empty name', patch: { name: '' }, reason: 'INVALID_PLAYLIST_DATA' },
    { label: 'whitespace name', patch: { name: ' \t\n ' }, reason: 'INVALID_PLAYLIST_DATA' },
    {
      label: '256 character name',
      patch: { name: 'n'.repeat(256) },
      reason: 'INVALID_PLAYLIST_DATA',
    },
    {
      label: '1001 character description',
      patch: { description: 'd'.repeat(1001) },
      reason: 'INVALID_PLAYLIST_DATA',
    },
    {
      label: 'series without metadata',
      patch: { type: 'series' },
      reason: 'INVALID_SERIES_METADATA',
    },
    {
      label: 'series without series name',
      patch: { type: 'series', metadata: {} },
      reason: 'INVALID_SERIES_METADATA',
    },
    {
      label: 'season without series name',
      patch: { type: 'season', metadata: { seasonNumber: 1 } },
      reason: 'INVALID_SERIES_METADATA',
    },
    {
      label: 'season without number',
      patch: { type: 'season', metadata: { seriesName: 'Saga' } },
      reason: 'INVALID_SERIES_METADATA',
    },
    {
      label: 'season zero',
      patch: { type: 'season', metadata: { seriesName: 'Saga', seasonNumber: 0 } },
      reason: 'INVALID_SERIES_METADATA',
    },
    {
      label: 'negative season',
      patch: { type: 'season', metadata: { seriesName: 'Saga', seasonNumber: -1 } },
      reason: 'INVALID_SERIES_METADATA',
    },
  ] satisfies Array<{ label: string; patch: Partial<CreatePlaylistInput>; reason: string }>)(
    'rejects $label before any dependency call',
    async ({ patch, reason }) => {
      const state = setupCreate();
      await expect(state.useCase.execute(creation(patch))).resolves.toMatchObject({
        ok: false,
        reason,
      });
      expect(state.nameExistsForOwner).not.toHaveBeenCalled();
      expect(state.findById).not.toHaveBeenCalled();
      expect(state.create).not.toHaveBeenCalled();
    },
  );

  test('accepts trimmed maximum lengths and forwards a public creation without losing its fields', async () => {
    const state = setupCreate();
    const name = 'n'.repeat(255);
    const description = 'd'.repeat(1000);
    const metadata = { genre: ['action'], year: 2026 };
    await expect(
      state.useCase.execute(
        creation({ name: ` ${name} `, description: ` ${description} `, isPublic: true, metadata }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { playlistId: 'created-id' } });
    expect(state.nameExistsForOwner).toHaveBeenCalledExactlyOnceWith(name, 'owner-1');
    expect(state.create.mock.calls).toStrictEqual([
      [
        {
          name,
          description,
          isPublic: true,
          metadata,
          ownerId: 'owner-1',
          type: 'user_created',
          videoIds: [],
        },
      ],
    ]);
    expect(state.findById).not.toHaveBeenCalled();
  });

  test.each([1, 2])('allows season %i with a series name', async (seasonNumber) => {
    const state = setupCreate();
    await expect(
      state.useCase.execute(
        creation({ type: 'season', metadata: { seriesName: 'Saga', seasonNumber } }),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(state.create).toHaveBeenCalledExactlyOnceWith({
      name: 'New playlist',
      description: undefined,
      isPublic: false,
      metadata: { seriesName: 'Saga', seasonNumber },
      ownerId: 'owner-1',
      type: 'season',
      videoIds: [],
    });
  });

  test('checks all initial videos in owner scope before creating and preserves their requested order', async () => {
    const state = setupCreate();
    const reads: string[] = [];
    state.findById.mockImplementation(async (id, scope) => {
      expect(scope).toEqual({ type: 'public_or_owned', ownerId: 'owner-1' });
      expect(state.create).not.toHaveBeenCalled();
      reads.push(id);
      return { id, title: id, duration: 10 };
    });
    await expect(
      state.useCase.execute(creation({ initialVideoIds: ['second', 'first'], description: '   ' })),
    ).resolves.toMatchObject({ ok: true });
    expect(reads).toEqual(['second', 'first']);
    expect(state.findById).toHaveBeenCalledTimes(2);
    expect(state.create.mock.calls).toStrictEqual([
      [
        {
          name: 'New playlist',
          description: undefined,
          isPublic: false,
          metadata: undefined,
          ownerId: 'owner-1',
          type: 'user_created',
          videoIds: ['second', 'first'],
        },
      ],
    ]);
  });

  test.each(['missing', 'rejected'] as const)(
    'does not create a partially validated playlist when the second video is %s',
    async (failure) => {
      const state = setupCreate();
      state.findById.mockResolvedValueOnce({ id: 'first', title: 'First', duration: 10 });
      if (failure === 'missing') {
        state.findById.mockResolvedValueOnce(null);
      } else {
        state.findById.mockRejectedValueOnce(new Error('catalog unavailable'));
      }
      await expect(
        state.useCase.execute(creation({ initialVideoIds: ['first', 'second', 'third'] })),
      ).resolves.toMatchObject({
        ok: false,
        reason: failure === 'missing' ? 'VIDEO_NOT_FOUND' : 'PLAYLIST_MUTATION_FAILED',
      });
      expect(state.findById.mock.calls).toEqual([
        ['first', { type: 'public_or_owned', ownerId: 'owner-1' }],
        ['second', { type: 'public_or_owned', ownerId: 'owner-1' }],
      ]);
      expect(state.create).not.toHaveBeenCalled();
    },
  );

  test('does not read videos or create when duplicate-name lookup fails', async () => {
    const state = setupCreate();
    state.nameExistsForOwner.mockRejectedValueOnce(new Error('repository unavailable'));
    await expect(
      state.useCase.execute(creation({ initialVideoIds: ['first'] })),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
    expect(state.findById).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  test('reports a failed create rather than returning an optimistic id or retrying a write', async () => {
    const state = setupCreate();
    state.create.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(state.useCase.execute(creation())).resolves.toMatchObject({
      ok: false,
      reason: 'PLAYLIST_MUTATION_FAILED',
    });
    expect(state.create).toHaveBeenCalledTimes(1);
  });
});

describe('playlist update patch boundaries', () => {
  test.each([
    { label: 'no fields', patch: {}, reason: 'VALIDATION_ERROR' },
    { label: 'empty name', patch: { name: '' }, reason: 'INVALID_PLAYLIST_DATA' },
    { label: 'whitespace name', patch: { name: ' \t ' }, reason: 'INVALID_PLAYLIST_DATA' },
    { label: 'overlong name', patch: { name: 'n'.repeat(256) }, reason: 'INVALID_PLAYLIST_DATA' },
    {
      label: 'overlong description',
      patch: { description: 'd'.repeat(1001) },
      reason: 'INVALID_PLAYLIST_DATA',
    },
  ] satisfies Array<{ label: string; patch: Partial<UpdatePlaylistInput>; reason: string }>)(
    'rejects $label before repository access',
    async ({ patch, reason }) => {
      const state = setupUpdate();
      await expect(state.useCase.execute({ ...updateIdentity, ...patch })).resolves.toMatchObject({
        ok: false,
        reason,
      });
      expect(state.findById).not.toHaveBeenCalled();
      expect(state.nameExistsForOwner).not.toHaveBeenCalled();
      expect(state.update).not.toHaveBeenCalled();
    },
  );

  test.each([
    {
      label: 'description only',
      input: { description: ' Updated ' },
      patch: { description: 'Updated' },
      fields: ['description'],
    },
    {
      label: 'clear description',
      input: { description: '' },
      patch: { description: undefined },
      fields: ['description'],
    },
    {
      label: 'whitespace description',
      input: { description: ' \t ' },
      patch: { description: undefined },
      fields: ['description'],
    },
    {
      label: 'visibility only',
      input: { isPublic: true },
      patch: { isPublic: true },
      fields: ['isPublic'],
    },
    {
      label: 'metadata only',
      input: { metadata: { genre: ['comedy'], year: 2026 } },
      patch: { metadata: { seriesName: 'Saga', genre: ['comedy'], year: 2026 } },
      fields: ['metadata'],
    },
  ])(
    'persists exactly the $label patch, without adding an undefined name or overwriting other fields',
    async ({ input, patch, fields }) => {
      const state = setupUpdate();
      await expect(state.useCase.execute({ ...updateIdentity, ...input })).resolves.toMatchObject({
        ok: true,
        data: { fieldsUpdated: fields },
      });
      expect(state.update.mock.calls).toStrictEqual([['playlist-owned', patch]]);
      expect(state.nameExistsForOwner).not.toHaveBeenCalled();
    },
  );

  test('can turn public visibility off without interpreting false as an absent update', async () => {
    const state = setupUpdate(storedPlaylist({ isPublic: true }));
    await expect(
      state.useCase.execute({ ...updateIdentity, isPublic: false }),
    ).resolves.toMatchObject({
      ok: true,
      data: { fieldsUpdated: ['isPublic'], playlist: { isPublic: false } },
    });
    expect(state.update.mock.calls).toStrictEqual([['playlist-owned', { isPublic: false }]]);
  });

  test('accepts exact trimmed update limits and checks the normalized name against the same owner excluding this playlist', async () => {
    const state = setupUpdate();
    const name = 'n'.repeat(255);
    const description = 'd'.repeat(1000);
    await expect(
      state.useCase.execute({
        ...updateIdentity,
        name: ` ${name} `,
        description: ` ${description} `,
      }),
    ).resolves.toMatchObject({ ok: true, data: { fieldsUpdated: ['name', 'description'] } });
    expect(state.nameExistsForOwner).toHaveBeenCalledExactlyOnceWith(
      name,
      'owner-1',
      'playlist-owned',
    );
    expect(state.update.mock.calls).toStrictEqual([['playlist-owned', { name, description }]]);
  });

  test.each([false, true])('denies a non-owner update even when public=%s', async (isPublic) => {
    const state = setupUpdate(storedPlaylist({ ownerId: 'someone-else', isPublic }));
    await expect(
      state.useCase.execute({ ...updateIdentity, name: 'Changed' }),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_PERMISSION_DENIED' });
    expect(state.nameExistsForOwner).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  test('does not write any of a multi-field patch when the normalized new name is already taken', async () => {
    const state = setupUpdate();
    state.nameExistsForOwner.mockResolvedValueOnce(true);
    await expect(
      state.useCase.execute({
        ...updateIdentity,
        name: ' Taken ',
        description: 'Changed',
        isPublic: true,
      }),
    ).resolves.toMatchObject({ ok: false, reason: 'DUPLICATE_PLAYLIST_NAME' });
    expect(state.nameExistsForOwner).toHaveBeenCalledExactlyOnceWith(
      'Taken',
      'owner-1',
      'playlist-owned',
    );
    expect(state.update).not.toHaveBeenCalled();
  });

  test('returns not found without checking names or writing', async () => {
    const state = setupUpdate();
    state.findById.mockResolvedValueOnce(null);
    await expect(
      state.useCase.execute({ ...updateIdentity, name: 'Changed' }),
    ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_NOT_FOUND' });
    expect(state.nameExistsForOwner).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  test.each(['lookup', 'duplicate lookup', 'write rejection', 'missing write result'] as const)(
    'returns a mutation failure for %s, without an optimistic success or extra write',
    async (stage) => {
      const state = setupUpdate();
      if (stage === 'lookup') {
        state.findById.mockRejectedValueOnce(new Error('unavailable'));
      }
      if (stage === 'duplicate lookup') {
        state.nameExistsForOwner.mockRejectedValueOnce(new Error('unavailable'));
      }
      if (stage === 'write rejection') {
        state.update.mockRejectedValueOnce(new Error('unavailable'));
      }
      if (stage === 'missing write result') {
        state.update.mockResolvedValueOnce(null);
      }
      await expect(
        state.useCase.execute({ ...updateIdentity, name: 'Changed' }),
      ).resolves.toMatchObject({ ok: false, reason: 'PLAYLIST_MUTATION_FAILED' });
      expect(state.update).toHaveBeenCalledTimes(
        stage === 'lookup' || stage === 'duplicate lookup' ? 0 : 1,
      );
    },
  );
});

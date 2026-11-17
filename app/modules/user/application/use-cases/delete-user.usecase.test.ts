import { type Mock, describe, expect, test, vi } from 'vitest';
import type { OwnedVideoCounterPort } from '../ports/owned-video-counter.port';
import type { UserRepository } from '../ports/user-repository.port';
import { DeleteUserUseCase } from './delete-user.usecase';

type RepositoryMock = { [Method in keyof UserRepository]: Mock<UserRepository[Method]> };

function createRepository(overrides: Partial<RepositoryMock> = {}): RepositoryMock {
  return {
    count: vi.fn(async () => 1),
    create: vi.fn<UserRepository['create']>(),
    deleteByUsernameKey: vi.fn(async () => true),
    findById: vi.fn(async () => null),
    findByUsernameKey: vi.fn(async () => ({
      createdAt: new Date('2026-05-16T00:00:00.000Z'),
      id: 'user-1',
      passwordHash: '$argon2id$hash',
      username: 'Owner',
      usernameKey: 'owner',
    })),
    ...overrides,
  };
}

function createOwnedVideoCounter(count = 0) {
  return {
    countOwnedVideos: vi.fn(async () => count),
  } satisfies OwnedVideoCounterPort;
}

describe('DeleteUserUseCase', () => {
  test('deletes an existing user by normalized username', async () => {
    const repository = createRepository();
    const ownedVideoCounter = createOwnedVideoCounter();
    const useCase = new DeleteUserUseCase({
      activeUploadCounter: { countActiveUploads: vi.fn(async () => 0) },
      ownedVideoCounter,
      userRepository: repository,
    });

    await expect(
      useCase.execute({
        username: ' owner ',
      }),
    ).resolves.toEqual({
      ok: true,
      user: {
        createdAt: new Date('2026-05-16T00:00:00.000Z'),
        id: 'user-1',
        passwordHash: '$argon2id$hash',
        username: 'Owner',
        usernameKey: 'owner',
      },
    });

    expect(repository.findByUsernameKey).toHaveBeenCalledWith('owner');
    expect(ownedVideoCounter.countOwnedVideos).toHaveBeenCalledWith('user-1');
    expect(repository.deleteByUsernameKey).toHaveBeenCalledWith('owner');
  });

  test('blocks deletion when the user owns videos', async () => {
    const repository = createRepository();
    const useCase = new DeleteUserUseCase({
      activeUploadCounter: { countActiveUploads: vi.fn(async () => 0) },
      ownedVideoCounter: createOwnedVideoCounter(2),
      userRepository: repository,
    });

    await expect(
      useCase.execute({
        username: 'owner',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'USER_OWNS_VIDEOS',
    });

    expect(repository.deleteByUsernameKey).not.toHaveBeenCalled();
  });

  test('blocks account deletion until active source uploads are cancelled', async () => {
    const repository = createRepository();
    const countActiveUploads = vi.fn(async () => 1);
    const useCase = new DeleteUserUseCase({
      activeUploadCounter: { countActiveUploads },
      ownedVideoCounter: createOwnedVideoCounter(),
      userRepository: repository,
    });
    await expect(useCase.execute({ username: 'owner' })).resolves.toEqual({
      ok: false,
      reason: 'USER_HAS_ACTIVE_UPLOADS',
    });
    expect(countActiveUploads).toHaveBeenCalledWith('user-1');
    expect(repository.deleteByUsernameKey).not.toHaveBeenCalled();
  });

  test('rejects invalid and missing usernames', async () => {
    const repository = createRepository({
      findByUsernameKey: vi.fn(async () => null),
    });
    const useCase = new DeleteUserUseCase({
      activeUploadCounter: { countActiveUploads: vi.fn(async () => 0) },
      ownedVideoCounter: createOwnedVideoCounter(),
      userRepository: repository,
    });

    await expect(
      useCase.execute({
        username: '../owner',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'INVALID_USERNAME',
    });

    await expect(
      useCase.execute({
        username: 'missing',
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'USER_NOT_FOUND',
    });

    expect(repository.deleteByUsernameKey).not.toHaveBeenCalled();
  });
});

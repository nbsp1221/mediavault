import { describe, expect, test, vi } from 'vitest';
import type { OwnedVideoCounterPort } from '../ports/owned-video-counter.port';
import type { UserRepository } from '../ports/user-repository.port';
import { DeleteUserUseCase } from './delete-user.usecase';

function createRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    count: vi.fn(async () => 1),
    create: vi.fn(),
    deleteByUsernameKey: vi.fn(async () => true),
    findById: vi.fn(async () => null),
    findByUsernameKey: vi.fn(async () => ({
      createdAt: new Date('2026-05-16T00:00:00.000Z'),
      id: 'user-1',
      passwordHash: '$argon2id$hash',
      role: 'admin' as const,
      username: 'Owner',
      usernameKey: 'owner',
    })),
    ...overrides,
  };
}

function createOwnedVideoCounter(count = 0): OwnedVideoCounterPort {
  return {
    countOwnedVideos: vi.fn(async () => count),
  };
}

describe('DeleteUserUseCase', () => {
  test('deletes an existing user by normalized username', async () => {
    const repository = createRepository();
    const ownedVideoCounter = createOwnedVideoCounter();
    const useCase = new DeleteUserUseCase({
      ownedVideoCounter,
      userRepository: repository,
    });

    await expect(useCase.execute({
      username: ' owner ',
    })).resolves.toEqual({
      ok: true,
      user: expect.objectContaining({
        id: 'user-1',
        username: 'Owner',
      }),
    });

    expect(repository.findByUsernameKey).toHaveBeenCalledWith('owner');
    expect(ownedVideoCounter.countOwnedVideos).toHaveBeenCalledWith('user-1');
    expect(repository.deleteByUsernameKey).toHaveBeenCalledWith('owner');
  });

  test('blocks deletion when the user owns videos', async () => {
    const repository = createRepository();
    const useCase = new DeleteUserUseCase({
      ownedVideoCounter: createOwnedVideoCounter(2),
      userRepository: repository,
    });

    await expect(useCase.execute({
      username: 'owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'USER_OWNS_VIDEOS',
    });

    expect(repository.deleteByUsernameKey).not.toHaveBeenCalled();
  });

  test('rejects invalid and missing usernames', async () => {
    const repository = createRepository({
      findByUsernameKey: vi.fn(async () => null),
    });
    const useCase = new DeleteUserUseCase({
      ownedVideoCounter: createOwnedVideoCounter(),
      userRepository: repository,
    });

    await expect(useCase.execute({
      username: '../owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_USERNAME',
    });

    await expect(useCase.execute({
      username: 'missing',
    })).resolves.toEqual({
      ok: false,
      reason: 'USER_NOT_FOUND',
    });

    expect(repository.deleteByUsernameKey).not.toHaveBeenCalled();
  });
});

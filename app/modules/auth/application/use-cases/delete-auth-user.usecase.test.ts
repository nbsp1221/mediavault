import { describe, expect, test, vi } from 'vitest';
import type { AuthUserRepository } from '../ports/auth-user-repository.port';
import { DeleteAuthUserUseCase } from './delete-auth-user.usecase';

function createRepository(overrides: Partial<AuthUserRepository> = {}): AuthUserRepository {
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

describe('DeleteAuthUserUseCase', () => {
  test('deletes an existing user by normalized username', async () => {
    const repository = createRepository();
    const sessionRepository = {
      revokeByUserId: vi.fn(async () => {}),
    };
    const useCase = new DeleteAuthUserUseCase({
      authUserRepository: repository,
      sessionRepository,
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
    expect(repository.deleteByUsernameKey).toHaveBeenCalledWith('owner');
    expect(sessionRepository.revokeByUserId).toHaveBeenCalledWith('user-1');
  });

  test('rejects invalid and missing usernames', async () => {
    const repository = createRepository({
      findByUsernameKey: vi.fn(async () => null),
    });
    const sessionRepository = {
      revokeByUserId: vi.fn(async () => {}),
    };
    const useCase = new DeleteAuthUserUseCase({
      authUserRepository: repository,
      sessionRepository,
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
    expect(sessionRepository.revokeByUserId).not.toHaveBeenCalled();
  });
});

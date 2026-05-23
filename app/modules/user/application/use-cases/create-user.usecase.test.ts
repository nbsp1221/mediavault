import { describe, expect, test, vi } from 'vitest';
import type { PasswordHashService } from '../ports/password-hash-service.port';
import type { UserRepository } from '../ports/user-repository.port';
import { CreateUserUseCase } from './create-user.usecase';

function createRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    count: vi.fn(async () => 0),
    create: vi.fn(async input => ({
      createdAt: input.createdAt,
      id: input.id,
      passwordHash: input.passwordHash,
      role: input.role,
      username: input.username,
      usernameKey: input.usernameKey,
    })),
    deleteByUsernameKey: vi.fn(async () => true),
    findById: vi.fn(async () => null),
    findByUsernameKey: vi.fn(async () => null),
    ...overrides,
  };
}

function createPasswordHashService(): PasswordHashService {
  return {
    hash: vi.fn(async password => `hashed:${password}`),
  };
}

describe('CreateUserUseCase', () => {
  test('creates a user with normalized username and hashed password', async () => {
    const repository = createRepository();
    const passwordHashService = createPasswordHashService();
    const useCase = new CreateUserUseCase({
      createUserId: () => 'user-1',
      passwordHashService,
      userRepository: repository,
    });

    const result = await useCase.execute({
      now: new Date('2026-05-16T00:00:00.000Z'),
      password: 'correct-password',
      username: ' Owner ',
    });

    expect(result).toEqual({
      ok: true,
      user: {
        createdAt: new Date('2026-05-16T00:00:00.000Z'),
        id: 'user-1',
        passwordHash: 'hashed:correct-password',
        role: 'admin',
        username: 'Owner',
        usernameKey: 'owner',
      },
    });
    expect(passwordHashService.hash).toHaveBeenCalledWith('correct-password');
    expect(repository.create).toHaveBeenCalledWith(
      {
        createdAt: new Date('2026-05-16T00:00:00.000Z'),
        id: 'user-1',
        passwordHash: 'hashed:correct-password',
        role: 'admin',
        username: 'Owner',
        usernameKey: 'owner',
      },
      {
        requireFirstUser: undefined,
      },
    );
  });

  test('rejects invalid username and password before hashing', async () => {
    const repository = createRepository();
    const passwordHashService = createPasswordHashService();
    const useCase = new CreateUserUseCase({
      createUserId: () => 'user-1',
      passwordHashService,
      userRepository: repository,
    });

    await expect(useCase.execute({
      password: 'correct-password',
      username: '../owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_USERNAME',
    });

    await expect(useCase.execute({
      password: 'abc',
      username: 'owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_PASSWORD',
    });

    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects duplicate usernames without hashing', async () => {
    const repository = createRepository({
      findByUsernameKey: vi.fn(async () => ({
        createdAt: new Date('2026-05-16T00:00:00.000Z'),
        id: 'existing-user',
        passwordHash: '$argon2id$existing',
        role: 'admin' as const,
        username: 'Owner',
        usernameKey: 'owner',
      })),
    });
    const passwordHashService = createPasswordHashService();
    const useCase = new CreateUserUseCase({
      createUserId: () => 'user-1',
      passwordHashService,
      userRepository: repository,
    });

    await expect(useCase.execute({
      password: 'correct-password',
      username: ' owner ',
    })).resolves.toEqual({
      ok: false,
      reason: 'USERNAME_ALREADY_EXISTS',
    });

    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rejects first-user-only creation when the repository reports existing users', async () => {
    const repository = createRepository({
      create: vi.fn(async () => null),
    });
    const useCase = new CreateUserUseCase({
      createUserId: () => 'user-1',
      passwordHashService: createPasswordHashService(),
      userRepository: repository,
    });

    await expect(useCase.execute({
      password: 'correct-password',
      requireFirstUser: true,
      username: 'Owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'AUTH_USERS_ALREADY_EXIST',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        usernameKey: 'owner',
      }),
      {
        requireFirstUser: true,
      },
    );
  });
});

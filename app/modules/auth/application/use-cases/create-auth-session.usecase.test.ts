import { describe, expect, test, vi } from 'vitest';
import type { AuthUserRepository } from '../ports/auth-user-repository.port';
import type { PasswordHashService } from '../ports/password-hash-service.port';
import { CreateAuthSessionUseCase } from './create-auth-session.usecase';

const authUser = {
  createdAt: new Date('2026-05-16T00:00:00.000Z'),
  id: 'user-1',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
  role: 'admin' as const,
  username: 'Owner',
  usernameKey: 'owner',
};

function createUserRepository(overrides: Partial<AuthUserRepository> = {}): AuthUserRepository {
  return {
    count: async () => 1,
    create: async input => ({
      ...input,
      createdAt: input.createdAt,
    }),
    deleteByUsernameKey: async () => false,
    findById: async id => (id === authUser.id ? authUser : null),
    findByUsernameKey: async usernameKey => (usernameKey === authUser.usernameKey ? authUser : null),
    ...overrides,
  };
}

function createPasswordHashService(overrides: Partial<PasswordHashService> = {}): PasswordHashService {
  return {
    hash: async () => authUser.passwordHash,
    verify: async input => input.hash === authUser.passwordHash && input.password === 'correct-password',
    ...overrides,
  };
}

describe('CreateAuthSessionUseCase', () => {
  test('creates a user-bound session for valid credentials', async () => {
    const savedSessions: Array<{ id: string; userId: string }> = [];
    const reset = vi.fn();
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository(),
      createSessionId: () => 'session-1',
      loginAttemptGuard: {
        evaluate: () => ({ allowed: true }),
        registerFailure: vi.fn(),
        reset,
        runExclusive: async (_key, task) => task(),
      },
      passwordHashService: createPasswordHashService(),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async (session) => {
          savedSessions.push(session);
        },
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });

    const result = await useCase.execute({
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'correct-password',
      userAgent: 'vitest',
      username: ' Owner ',
    });

    expect(result.ok).toBe(true);
    expect(savedSessions).toHaveLength(1);
    expect(savedSessions[0]).toEqual(expect.objectContaining({
      id: 'session-1',
      userId: 'user-1',
    }));
    expect(reset).toHaveBeenCalledWith('vitest');
  });

  test('rejects a wrong password with a generic invalid credentials reason', async () => {
    const save = vi.fn();
    const delayOnInvalidCredentials = vi.fn(async () => {});
    const registerFailure = vi.fn();
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository(),
      createSessionId: () => 'session-2',
      loginAttemptGuard: {
        evaluate: () => ({ allowed: true }),
        registerFailure,
        reset: vi.fn(),
        runExclusive: async (_key, task) => task(),
      },
      onInvalidCredentials: delayOnInvalidCredentials,
      passwordHashService: createPasswordHashService({
        verify: async () => false,
      }),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save,
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });

    const result = await useCase.execute({
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'wrong-password',
      username: 'owner',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    });
    expect(save).not.toHaveBeenCalled();
    expect(delayOnInvalidCredentials).toHaveBeenCalledOnce();
    expect(registerFailure).toHaveBeenCalledWith({
      key: 'global',
      now: new Date('2026-03-07T00:00:00.000Z'),
    });
  });

  test('rejects an unknown username with the same invalid credentials reason', async () => {
    const verify = vi.fn(async () => false);
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository({
        findByUsernameKey: async () => null,
      }),
      createSessionId: () => 'session-3',
      passwordHashService: createPasswordHashService({
        verify,
      }),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async () => {},
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });

    const result = await useCase.execute({
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'correct-password',
      username: 'missing',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    });
    expect(verify).toHaveBeenCalledWith({
      hash: expect.stringMatching(/^\$argon2id\$/),
      password: 'correct-password',
    });
  });

  test('rejects invalid credential shape before lookup', async () => {
    const findByUsernameKey = vi.fn();
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository({
        findByUsernameKey,
      }),
      createSessionId: () => 'session-4',
      passwordHashService: createPasswordHashService(),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async () => {},
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });

    await expect(useCase.execute({
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'abc',
      username: 'owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    });
    await expect(useCase.execute({
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'correct-password',
      username: '../owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    });
    expect(findByUsernameKey).not.toHaveBeenCalled();
  });

  test('blocks account login when the attempt guard denies the request', async () => {
    const verify = vi.fn();
    const findByUsernameKey = vi.fn();
    const evaluate = vi.fn(({ key }: { key: string }) => (key === 'anonymous'
      ? {
          allowed: false,
          retryAfterSeconds: 60,
        }
      : {
          allowed: true,
        }));
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository({
        findByUsernameKey,
      }),
      createSessionId: () => 'session-5',
      loginAttemptGuard: {
        evaluate,
        registerFailure: vi.fn(),
        reset: vi.fn(),
        runExclusive: async (_key, task) => task(),
      },
      onInvalidCredentials: vi.fn(async () => {}),
      passwordHashService: createPasswordHashService({
        verify,
      }),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async () => {},
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });

    const result = await useCase.execute({
      attemptKeys: ['client:rotated', 'anonymous'],
      now: new Date('2026-03-07T00:00:00.000Z'),
      password: 'wrong-password',
      username: 'owner',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'RATE_LIMITED',
      retryAfterSeconds: 60,
    });
    expect(evaluate).toHaveBeenNthCalledWith(1, {
      key: 'client:rotated',
      now: new Date('2026-03-07T00:00:00.000Z'),
    });
    expect(evaluate).toHaveBeenNthCalledWith(2, {
      key: 'anonymous',
      now: new Date('2026-03-07T00:00:00.000Z'),
    });
    expect(findByUsernameKey).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  test('normalizes attempt keys, falls back to request metadata, and registers failures for each key once', async () => {
    const evaluate = vi.fn(() => ({ allowed: true }));
    const registerFailure = vi.fn();
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository(),
      createSessionId: () => 'session-6',
      loginAttemptGuard: {
        evaluate,
        registerFailure,
        reset: vi.fn(),
        runExclusive: async (key, task) => {
          expect(key).toBe('agent-key');
          return task();
        },
      },
      onInvalidCredentials: vi.fn(async () => {}),
      passwordHashService: createPasswordHashService({
        verify: async () => false,
      }),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async () => {},
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });
    const now = new Date('2026-03-07T00:00:00.000Z');

    await expect(useCase.execute({
      attemptKey: '  ignored-ip  ',
      attemptKeys: [' client-key ', '', 'client-key', 'agent-key'],
      ipAddress: '127.0.0.1',
      now,
      password: 'wrong-password',
      userAgent: 'agent-key',
      username: 'owner',
    })).resolves.toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIALS',
    });

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenNthCalledWith(1, { key: 'client-key', now });
    expect(evaluate).toHaveBeenNthCalledWith(2, { key: 'agent-key', now });
    expect(registerFailure).toHaveBeenCalledTimes(2);
    expect(registerFailure).toHaveBeenNthCalledWith(1, { key: 'client-key', now });
    expect(registerFailure).toHaveBeenNthCalledWith(2, { key: 'agent-key', now });
  });

  test('uses the explicit attempt key before IP, user agent, and global fallbacks', async () => {
    const evaluate = vi.fn(() => ({ allowed: true }));
    const reset = vi.fn();
    const useCase = new CreateAuthSessionUseCase({
      authUserRepository: createUserRepository(),
      createSessionId: () => 'session-7',
      loginAttemptGuard: {
        evaluate,
        registerFailure: vi.fn(),
        reset,
        runExclusive: async (key, task) => {
          expect(key).toBe('explicit-key');
          return task();
        },
      },
      passwordHashService: createPasswordHashService(),
      sessionRepository: {
        findById: async () => null,
        revoke: async () => {},
        save: async () => {},
        touch: async () => {},
      },
      sessionTtlMs: 60_000,
    });
    const now = new Date('2026-03-07T00:00:00.000Z');

    await expect(useCase.execute({
      attemptKey: ' explicit-key ',
      ipAddress: '127.0.0.1',
      now,
      password: 'correct-password',
      userAgent: 'vitest',
      username: 'owner',
    })).resolves.toMatchObject({
      ok: true,
    });

    expect(evaluate).toHaveBeenCalledWith({ key: 'explicit-key', now });
    expect(reset).toHaveBeenCalledWith('explicit-key');
  });
});

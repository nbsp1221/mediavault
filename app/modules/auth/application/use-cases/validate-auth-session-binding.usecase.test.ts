import { describe, expect, test, vi } from 'vitest';
import type { AuthSession } from '../../domain/auth-session';
import { ValidateAuthSessionBindingUseCase } from './validate-auth-session-binding.usecase';

const now = new Date('2026-11-02T00:00:00Z');
const activeSession: AuthSession = {
  createdAt: now,
  expiresAt: new Date(now.getTime() + 60_000),
  id: 'session-1',
  isRevoked: false,
  lastAccessedAt: now,
  userId: 'user-1',
};

describe('ValidateAuthSessionBindingUseCase', () => {
  test.each([
    ['missing', null],
    ['revoked', { ...activeSession, isRevoked: true }],
    ['expired', { ...activeSession, expiresAt: now }],
    ['another account', { ...activeSession, userId: 'user-2' }],
    ['another session', { ...activeSession, id: 'session-2' }],
  ] as const)('denies a %s binding before reading the account', async (_label, session) => {
    const hasUser = vi.fn(async () => true);
    const useCase = new ValidateAuthSessionBindingUseCase({
      hasUser,
      sessionRepository: { findById: vi.fn(async () => session) },
    });
    await expect(useCase.execute({ now, sessionId: 'session-1', userId: 'user-1' })).resolves.toBe(
      false,
    );
    expect(hasUser).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    'requires the account to remain present (%s) without extending session expiry',
    async (exists) => {
      const hasUser = vi.fn(async () => exists);
      const useCase = new ValidateAuthSessionBindingUseCase({
        hasUser,
        sessionRepository: { findById: vi.fn(async () => activeSession) },
      });
      await expect(
        useCase.execute({ now, sessionId: 'session-1', userId: 'user-1' }),
      ).resolves.toBe(exists);
      expect(hasUser).toHaveBeenCalledWith('user-1');
      expect(activeSession.expiresAt).toEqual(new Date(now.getTime() + 60_000));
    },
  );

  test('fails closed when session persistence cannot be read', async () => {
    const useCase = new ValidateAuthSessionBindingUseCase({
      hasUser: vi.fn(),
      sessionRepository: {
        findById: vi.fn(async () => {
          throw new Error('unavailable');
        }),
      },
    });
    await expect(
      useCase.execute({ now, sessionId: 'session-1', userId: 'user-1' }),
    ).rejects.toThrow('unavailable');
  });
});

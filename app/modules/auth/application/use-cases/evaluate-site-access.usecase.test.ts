import { describe, expect, test } from 'vitest';
import { SessionPolicy } from '../../domain/policies/SessionPolicy';
import { EvaluateSiteAccessUseCase } from './evaluate-site-access.usecase';

describe('EvaluateSiteAccessUseCase', () => {
  test('allows login page without a session', async () => {
    const useCase = new EvaluateSiteAccessUseCase({
      resolveAuthSession: {
        execute: async () => null,
      },
    });

    const result = await useCase.execute({
      now: new Date(),
      sessionId: null,
      surface: 'login-page',
    });

    expect(result).toEqual({
      decision: { allowed: true },
      session: null,
    });
  });

  test('denies protected page without a session', async () => {
    const useCase = new EvaluateSiteAccessUseCase({
      resolveAuthSession: {
        execute: async () => null,
      },
    });

    const result = await useCase.execute({
      now: new Date(),
      sessionId: null,
      surface: 'protected-page',
    });

    expect(result).toEqual({
      decision: {
        allowed: false,
        reason: 'AUTH_SESSION_REQUIRED',
      },
      session: null,
    });
  });

  test('allows protected media with an active session', async () => {
    const session = SessionPolicy.create({
      id: 'session-3',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });
    const useCase = new EvaluateSiteAccessUseCase({
      resolveAuthSession: {
        execute: async () => session,
      },
    });

    const result = await useCase.execute({
      now: new Date(),
      sessionId: 'session-3',
      surface: 'media-resource',
    });

    expect(result).toEqual({
      decision: { allowed: true },
      session,
    });
  });
});

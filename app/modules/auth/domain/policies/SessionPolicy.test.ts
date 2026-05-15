import { describe, expect, test } from 'vitest';
import { SessionPolicy } from './SessionPolicy';

describe('SessionPolicy', () => {
  test('creates an active session with expiry and timestamps', () => {
    const now = new Date('2026-03-07T00:00:00.000Z');

    const session = SessionPolicy.create({
      id: 'session-1',
      ipAddress: '127.0.0.1',
      now,
      ttlMs: 60_000,
      userId: 'user-1',
      userAgent: 'vitest',
    });

    expect(session).toEqual({
      createdAt: now,
      expiresAt: new Date('2026-03-07T00:01:00.000Z'),
      id: 'session-1',
      ipAddress: '127.0.0.1',
      isRevoked: false,
      lastAccessedAt: now,
      userId: 'user-1',
      userAgent: 'vitest',
    });
  });

  test('treats expired sessions as invalid', () => {
    const session = SessionPolicy.create({
      id: 'session-2',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 1_000,
      userId: 'user-1',
    });

    const decision = SessionPolicy.validate({
      now: new Date('2026-03-07T00:00:02.000Z'),
      session,
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'AUTH_SESSION_EXPIRED',
    });
  });

  test('treats a session expiring exactly now as expired', () => {
    const session = SessionPolicy.create({
      id: 'session-expiring-now',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 1_000,
      userId: 'user-1',
    });

    expect(SessionPolicy.validate({
      now: new Date('2026-03-07T00:00:01.000Z'),
      session,
    })).toEqual({
      allowed: false,
      reason: 'AUTH_SESSION_EXPIRED',
    });
  });

  test('treats revoked sessions as invalid', () => {
    const session = {
      ...SessionPolicy.create({
        id: 'session-3',
        now: new Date('2026-03-07T00:00:00.000Z'),
        ttlMs: 60_000,
        userId: 'user-1',
      }),
      isRevoked: true,
    };

    const decision = SessionPolicy.validate({
      now: new Date('2026-03-07T00:00:10.000Z'),
      session,
    });

    expect(decision).toEqual({
      allowed: false,
      reason: 'AUTH_SESSION_REVOKED',
    });
  });

  test('allows active sessions', () => {
    const session = SessionPolicy.create({
      id: 'session-4',
      now: new Date('2026-03-07T00:00:00.000Z'),
      ttlMs: 60_000,
      userId: 'user-1',
    });

    const decision = SessionPolicy.validate({
      now: new Date('2026-03-07T00:00:10.000Z'),
      session,
    });

    expect(decision).toEqual({ allowed: true });
  });
});

import type { AuthDecision, AuthSession } from '../auth-session';

interface CreateSessionInput {
  id: string;
  ipAddress?: string;
  now: Date;
  ttlMs: number;
  userId: string;
  userAgent?: string;
}

interface ValidateSessionInput {
  now: Date;
  session: AuthSession;
}

export class SessionPolicy {
  static create(input: CreateSessionInput): AuthSession {
    return {
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + input.ttlMs),
      id: input.id,
      ipAddress: input.ipAddress,
      isRevoked: false,
      lastAccessedAt: input.now,
      userId: input.userId,
      userAgent: input.userAgent,
    };
  }

  static validate(input: ValidateSessionInput): AuthDecision {
    if (input.session.isRevoked) {
      return {
        allowed: false,
        reason: 'AUTH_SESSION_REVOKED',
      };
    }

    if (input.session.expiresAt <= input.now) {
      return {
        allowed: false,
        reason: 'AUTH_SESSION_EXPIRED',
      };
    }

    return { allowed: true };
  }
}

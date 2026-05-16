import type { AuthSession } from '../../domain/auth-session';

export interface TouchAuthSessionInput {
  id: string;
  lastAccessedAt: Date;
  expiresAt: Date;
}

export interface AuthSessionRepository {
  findById: (id: string) => Promise<AuthSession | null>;
  revoke: (id: string) => Promise<void>;
  revokeByUserId: (userId: string) => Promise<void>;
  save: (session: AuthSession) => Promise<void>;
  touch: (input: TouchAuthSessionInput) => Promise<void>;
}

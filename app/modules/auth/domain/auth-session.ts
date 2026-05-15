export interface AuthSession {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  isRevoked: boolean;
  lastAccessedAt: Date;
  userId: string;
  userAgent?: string;
}

export type AuthDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

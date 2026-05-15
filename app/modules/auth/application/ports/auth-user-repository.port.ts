import type { AuthUser } from '../../domain/auth-user';

export interface CreateAuthUserInput {
  createdAt: Date;
  id: string;
  passwordHash: string;
  role: 'admin' | 'user';
  username: string;
  usernameKey: string;
}

export interface AuthUserRepository {
  count: () => Promise<number>;
  create: (input: CreateAuthUserInput) => Promise<AuthUser>;
  deleteByUsernameKey: (usernameKey: string) => Promise<boolean>;
  findById: (id: string) => Promise<AuthUser | null>;
  findByUsernameKey: (usernameKey: string) => Promise<AuthUser | null>;
}

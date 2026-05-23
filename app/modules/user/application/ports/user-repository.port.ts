import type { User } from '../../domain/entities/user.entity';

export interface CreateUserInput {
  createdAt: Date;
  id: string;
  passwordHash: string;
  role: 'admin' | 'user';
  username: string;
  usernameKey: string;
}

export interface UserRepository {
  count: () => Promise<number>;
  create: (input: CreateUserInput, options?: { requireFirstUser?: boolean }) => Promise<User | null>;
  deleteByUsernameKey: (usernameKey: string) => Promise<boolean>;
  findById: (id: string) => Promise<User | null>;
  findByUsernameKey: (usernameKey: string) => Promise<User | null>;
}

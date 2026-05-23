import type { User } from '../../domain/entities/user.entity';
import type { PasswordHashService } from '../ports/password-hash-service.port';
import type { UserRepository } from '../ports/user-repository.port';
import { validateUserPassword } from '../../domain/value-objects/user-password';
import { createUsername } from '../../domain/value-objects/username';

interface CreateUserUseCaseDependencies {
  createUserId: () => string;
  passwordHashService: PasswordHashService;
  userRepository: UserRepository;
}

interface CreateUserUseCaseInput {
  now?: Date;
  password: string;
  requireFirstUser?: boolean;
  username: string;
}

export type CreateUserUseCaseResult =
  | { ok: true; user: User }
  | {
    ok: false;
    reason:
      | 'INVALID_PASSWORD'
      | 'INVALID_USERNAME'
      | 'AUTH_USERS_ALREADY_EXIST'
      | 'USERNAME_ALREADY_EXISTS';
  };

export class CreateUserUseCase {
  constructor(private readonly deps: CreateUserUseCaseDependencies) {}

  async execute(input: CreateUserUseCaseInput): Promise<CreateUserUseCaseResult> {
    const username = createUsername(input.username);
    if (!username.ok) {
      return {
        ok: false,
        reason: 'INVALID_USERNAME',
      };
    }

    const passwordValidation = validateUserPassword(input.password);
    if (!passwordValidation.ok) {
      return {
        ok: false,
        reason: 'INVALID_PASSWORD',
      };
    }

    const existing = await this.deps.userRepository.findByUsernameKey(username.usernameKey);
    if (existing) {
      return {
        ok: false,
        reason: 'USERNAME_ALREADY_EXISTS',
      };
    }

    const passwordHash = await this.deps.passwordHashService.hash(input.password);
    const user = await this.deps.userRepository.create({
      createdAt: input.now ?? new Date(),
      id: this.deps.createUserId(),
      passwordHash,
      role: 'admin',
      username: username.username,
      usernameKey: username.usernameKey,
    }, {
      requireFirstUser: input.requireFirstUser,
    });

    if (!user) {
      return {
        ok: false,
        reason: 'AUTH_USERS_ALREADY_EXIST',
      };
    }

    return {
      ok: true,
      user,
    };
  }
}

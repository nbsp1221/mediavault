import type { AuthUser } from '../../domain/auth-user';
import type { AuthUserRepository } from '../ports/auth-user-repository.port';
import type { PasswordHashService } from '../ports/password-hash-service.port';
import { validateAuthPassword } from '../../domain/auth-password-policy';
import { createAuthUsername } from '../../domain/auth-username';

interface CreateAuthUserUseCaseDependencies {
  authUserRepository: AuthUserRepository;
  createUserId: () => string;
  passwordHashService: PasswordHashService;
}

interface CreateAuthUserUseCaseInput {
  now?: Date;
  password: string;
  requireFirstUser?: boolean;
  username: string;
}

export type CreateAuthUserUseCaseResult =
  | { ok: true; user: AuthUser }
  | {
    ok: false;
    reason:
      | 'INVALID_PASSWORD'
      | 'INVALID_USERNAME'
      | 'AUTH_USERS_ALREADY_EXIST'
      | 'USERNAME_ALREADY_EXISTS';
  };

export class CreateAuthUserUseCase {
  constructor(private readonly deps: CreateAuthUserUseCaseDependencies) {}

  async execute(input: CreateAuthUserUseCaseInput): Promise<CreateAuthUserUseCaseResult> {
    const username = createAuthUsername(input.username);
    if ('ok' in username) {
      return {
        ok: false,
        reason: 'INVALID_USERNAME',
      };
    }

    const passwordValidation = validateAuthPassword(input.password);
    if (!passwordValidation.ok) {
      return {
        ok: false,
        reason: 'INVALID_PASSWORD',
      };
    }

    const existing = await this.deps.authUserRepository.findByUsernameKey(username.usernameKey);
    if (existing) {
      return {
        ok: false,
        reason: 'USERNAME_ALREADY_EXISTS',
      };
    }

    const passwordHash = await this.deps.passwordHashService.hash(input.password);
    const user = await this.deps.authUserRepository.create({
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

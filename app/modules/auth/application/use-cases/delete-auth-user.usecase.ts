import type { AuthUser } from '../../domain/auth-user';
import type { AuthUserRepository } from '../ports/auth-user-repository.port';
import { createAuthUsername } from '../../domain/auth-username';

interface DeleteAuthUserUseCaseDependencies {
  authUserRepository: AuthUserRepository;
  sessionRepository: {
    revokeByUserId: (userId: string) => Promise<void>;
  };
}

interface DeleteAuthUserUseCaseInput {
  username: string;
}

export type DeleteAuthUserUseCaseResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: 'INVALID_USERNAME' | 'USER_NOT_FOUND' };

export class DeleteAuthUserUseCase {
  constructor(private readonly deps: DeleteAuthUserUseCaseDependencies) {}

  async execute(input: DeleteAuthUserUseCaseInput): Promise<DeleteAuthUserUseCaseResult> {
    const username = createAuthUsername(input.username);
    if ('ok' in username) {
      return {
        ok: false,
        reason: 'INVALID_USERNAME',
      };
    }

    const user = await this.deps.authUserRepository.findByUsernameKey(username.usernameKey);
    if (!user) {
      return {
        ok: false,
        reason: 'USER_NOT_FOUND',
      };
    }

    await this.deps.authUserRepository.deleteByUsernameKey(username.usernameKey);
    await this.deps.sessionRepository.revokeByUserId(user.id);

    return {
      ok: true,
      user,
    };
  }
}

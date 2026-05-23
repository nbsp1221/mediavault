import type { User } from '../../domain/entities/user.entity';
import type { OwnedVideoCounterPort } from '../ports/owned-video-counter.port';
import type { UserRepository } from '../ports/user-repository.port';
import { UserDeletionPolicy } from '../../domain/policies/user-deletion.policy';
import { createUsername } from '../../domain/value-objects/username';

interface DeleteUserUseCaseDependencies {
  ownedVideoCounter: OwnedVideoCounterPort;
  userRepository: UserRepository;
}

interface DeleteUserUseCaseInput {
  username: string;
}

export type DeleteUserUseCaseResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'INVALID_USERNAME' | 'USER_NOT_FOUND' | 'USER_OWNS_VIDEOS' };

export class DeleteUserUseCase {
  constructor(private readonly deps: DeleteUserUseCaseDependencies) {}

  async execute(input: DeleteUserUseCaseInput): Promise<DeleteUserUseCaseResult> {
    const username = createUsername(input.username);
    if (!username.ok) {
      return {
        ok: false,
        reason: 'INVALID_USERNAME',
      };
    }

    const user = await this.deps.userRepository.findByUsernameKey(username.usernameKey);
    if (!user) {
      return {
        ok: false,
        reason: 'USER_NOT_FOUND',
      };
    }

    const deletionDecision = UserDeletionPolicy.evaluate({
      ownedVideoCount: await this.deps.ownedVideoCounter.countOwnedVideos(user.id),
    });

    if (!deletionDecision.allowed) {
      return {
        ok: false,
        reason: deletionDecision.reason,
      };
    }

    await this.deps.userRepository.deleteByUsernameKey(username.usernameKey);

    return {
      ok: true,
      user,
    };
  }
}

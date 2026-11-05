import type { AuthSessionRepository } from '../ports/auth-session-repository.port';
import { SessionPolicy } from '../../domain/policies/SessionPolicy';

interface ValidateAuthSessionBindingDependencies {
  hasUser: (userId: string) => Promise<boolean>;
  sessionRepository: Pick<AuthSessionRepository, 'findById'>;
}

/** Revalidate a bearer grant without extending the cookie session's lifetime. */
export class ValidateAuthSessionBindingUseCase {
  constructor(private readonly deps: ValidateAuthSessionBindingDependencies) {}

  async execute(input: { now: Date; sessionId: string; userId: string }): Promise<boolean> {
    const session = await this.deps.sessionRepository.findById(input.sessionId);
    if (
      !session ||
      session.id !== input.sessionId ||
      session.userId !== input.userId ||
      !SessionPolicy.validate({ now: input.now, session }).allowed
    ) {
      return false;
    }
    return this.deps.hasUser(input.userId);
  }
}

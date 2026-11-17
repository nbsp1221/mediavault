import type { AuthSession } from '../../domain/auth-session';
import { SiteAccessPolicy, type SiteSurface } from '../../domain/policies/SiteAccessPolicy';

interface ResolveAuthSessionPort {
  execute: (input: { now: Date; sessionId: string | null }) => Promise<AuthSession | null>;
}

interface EvaluateSiteAccessUseCaseDependencies {
  resolveAuthSession: ResolveAuthSessionPort;
}

interface EvaluateSiteAccessUseCaseInput {
  now: Date;
  sessionId: string | null;
  surface: SiteSurface;
}

export class EvaluateSiteAccessUseCase {
  constructor(private readonly deps: EvaluateSiteAccessUseCaseDependencies) {}

  async execute(input: EvaluateSiteAccessUseCaseInput) {
    const session = await this.deps.resolveAuthSession.execute({
      now: input.now,
      sessionId: input.sessionId,
    });

    return {
      decision: SiteAccessPolicy.evaluate({
        hasActiveSession: Boolean(session),
        surface: input.surface,
      }),
      session,
    };
  }
}

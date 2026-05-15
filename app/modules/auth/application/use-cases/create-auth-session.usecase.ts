import type { AuthSession } from '../../domain/auth-session';
import type { AuthSessionRepository } from '../ports/auth-session-repository.port';
import type { AuthUserRepository } from '../ports/auth-user-repository.port';
import type { LoginAttemptGuard } from '../ports/login-attempt-guard.port';
import type { PasswordHashService } from '../ports/password-hash-service.port';
import { validateAuthPassword } from '../../domain/auth-password-policy';
import { createAuthUsername } from '../../domain/auth-username';
import { SessionPolicy } from '../../domain/policies/SessionPolicy';

interface CreateAuthSessionUseCaseDependencies {
  authUserRepository: AuthUserRepository;
  createSessionId: () => string;
  loginAttemptGuard?: LoginAttemptGuard;
  onInvalidCredentials?: () => Promise<void>;
  passwordHashService: PasswordHashService;
  sessionRepository: AuthSessionRepository;
  sessionTtlMs: number;
}

interface CreateAuthSessionUseCaseInput {
  attemptKey?: string;
  attemptKeys?: string[];
  ipAddress?: string;
  now: Date;
  password: string;
  userAgent?: string;
  username: string;
}

type CreateAuthSessionUseCaseResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'INVALID_CREDENTIALS' }
  | { ok: false; reason: 'RATE_LIMITED'; retryAfterSeconds: number };

const missingUserPasswordHash = '$argon2id$v=19$m=65536,t=3,p=4$gAxMt01zhbLw2749qtYKyw$rFXDGJGWvkCNiUJvmDmTu+RgkA0nTCsbbmG/RopVGvI';

export class CreateAuthSessionUseCase {
  constructor(private readonly deps: CreateAuthSessionUseCaseDependencies) {}

  async execute(input: CreateAuthSessionUseCaseInput): Promise<CreateAuthSessionUseCaseResult> {
    const attemptKeys = Array.from(
      new Set(
        (input.attemptKeys ?? [])
          .map(key => key.trim())
          .filter(Boolean),
      ),
    );
    const fallbackAttemptKey = input.attemptKey?.trim() || input.ipAddress?.trim() || input.userAgent?.trim() || 'global';

    if (attemptKeys.length === 0) {
      attemptKeys.push(fallbackAttemptKey);
    }

    const lockKey = attemptKeys[attemptKeys.length - 1] ?? fallbackAttemptKey;

    const performAttempt = async (): Promise<CreateAuthSessionUseCaseResult> => {
      for (const key of attemptKeys) {
        const attemptDecision = this.deps.loginAttemptGuard?.evaluate({
          key,
          now: input.now,
        });

        if (attemptDecision && !attemptDecision.allowed) {
          return {
            ok: false,
            reason: 'RATE_LIMITED',
            retryAfterSeconds: attemptDecision.retryAfterSeconds ?? 60,
          };
        }
      }

      const username = createAuthUsername(input.username);
      const passwordValidation = validateAuthPassword(input.password);

      if ('ok' in username || !passwordValidation.ok) {
        for (const key of attemptKeys) {
          this.deps.loginAttemptGuard?.registerFailure({
            key,
            now: input.now,
          });
        }

        await this.deps.onInvalidCredentials?.();

        return {
          ok: false,
          reason: 'INVALID_CREDENTIALS',
        };
      }

      const user = await this.deps.authUserRepository.findByUsernameKey(username.usernameKey);
      const passwordMatches = await this.deps.passwordHashService.verify({
        hash: user?.passwordHash ?? missingUserPasswordHash,
        password: input.password,
      });

      if (!user || !passwordMatches) {
        for (const key of attemptKeys) {
          this.deps.loginAttemptGuard?.registerFailure({
            key,
            now: input.now,
          });
        }

        await this.deps.onInvalidCredentials?.();

        return {
          ok: false,
          reason: 'INVALID_CREDENTIALS',
        };
      }

      for (const key of attemptKeys) {
        this.deps.loginAttemptGuard?.reset(key);
      }

      const session = SessionPolicy.create({
        id: this.deps.createSessionId(),
        ipAddress: input.ipAddress,
        now: input.now,
        ttlMs: this.deps.sessionTtlMs,
        userId: user.id,
        userAgent: input.userAgent,
      });

      await this.deps.sessionRepository.save(session);

      return {
        ok: true,
        session,
      };
    };

    if (this.deps.loginAttemptGuard) {
      return this.deps.loginAttemptGuard.runExclusive(lockKey, performAttempt);
    }

    return performAttempt();
  }
}

import { Mutex } from 'async-mutex';
import type {
  EvaluateLoginAttemptInput,
  LoginAttemptDecision,
  LoginAttemptGuard,
  RegisterLoginAttemptFailureInput,
} from '../../application/ports/login-attempt-guard.port';

interface LoginAttemptRecord {
  blockedUntil: number | null;
  count: number;
  windowStartedAt: number;
}

interface InMemoryLoginAttemptGuardOptions {
  blockDurationMs: number;
  maxFailures: number;
  windowMs: number;
}

export class InMemoryLoginAttemptGuard implements LoginAttemptGuard {
  private readonly mutexes = new Map<string, Mutex>();
  private readonly mutexTouchedAt = new Map<string, number>();
  private readonly records = new Map<string, LoginAttemptRecord>();

  constructor(private readonly options: InMemoryLoginAttemptGuardOptions) {}

  private getIdleMutexTtlMs(): number {
    return this.options.windowMs + this.options.blockDurationMs;
  }

  private cleanupExpiredState(nowMs: number): void {
    for (const [key, record] of this.records) {
      const windowExpired = record.windowStartedAt + this.options.windowMs <= nowMs;
      const blockExpired = !record.blockedUntil || record.blockedUntil <= nowMs;

      if (windowExpired && blockExpired) {
        this.records.delete(key);
      }
    }

    const idleMutexTtlMs = this.getIdleMutexTtlMs();

    for (const [key, mutex] of this.mutexes) {
      const record = this.records.get(key);

      if (record) {
        continue;
      }

      const lastTouchedAt = this.mutexTouchedAt.get(key) ?? 0;

      if (!mutex.isLocked() && lastTouchedAt + idleMutexTtlMs <= nowMs) {
        this.mutexes.delete(key);
        this.mutexTouchedAt.delete(key);
      }
    }
  }

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    this.cleanupExpiredState(Date.now());

    let mutex = this.mutexes.get(key);

    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }

    this.mutexTouchedAt.set(key, Date.now());

    return mutex.runExclusive(async () => {
      try {
        return await task();
      } finally {
        const finishedAt = Date.now();
        this.mutexTouchedAt.set(key, finishedAt);
        this.cleanupExpiredState(finishedAt);
      }
    });
  }

  evaluate(input: EvaluateLoginAttemptInput): LoginAttemptDecision {
    const nowMs = input.now.getTime();
    this.cleanupExpiredState(nowMs);
    const record = this.records.get(input.key);

    if (!record) {
      return { allowed: true };
    }

    if (record.blockedUntil && record.blockedUntil > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil - nowMs) / 1000)),
      };
    }

    if (record.windowStartedAt + this.options.windowMs <= nowMs) {
      this.records.delete(input.key);
      this.cleanupExpiredState(nowMs);
      return { allowed: true };
    }
    return { allowed: true };
  }

  registerFailure(input: RegisterLoginAttemptFailureInput): void {
    const nowMs = input.now.getTime();
    this.cleanupExpiredState(nowMs);
    const existingRecord = this.records.get(input.key);

    if (!existingRecord || existingRecord.windowStartedAt + this.options.windowMs <= nowMs) {
      this.records.set(input.key, {
        blockedUntil: null,
        count: 1,
        windowStartedAt: nowMs,
      });
      return;
    }

    const nextCount = existingRecord.count + 1;
    this.records.set(input.key, {
      blockedUntil:
        nextCount >= this.options.maxFailures ? nowMs + this.options.blockDurationMs : null,
      count: nextCount,
      windowStartedAt: existingRecord.windowStartedAt,
    });
  }

  reset(key: string): void {
    this.records.delete(key);
    this.cleanupExpiredState(Date.now());
  }
}

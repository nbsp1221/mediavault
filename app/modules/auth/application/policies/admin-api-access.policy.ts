import { createHash, timingSafeEqual } from 'node:crypto';

export type AdminApiOperation = 'create-user' | 'delete-user';
export type AdminApiMode = 'always' | 'bootstrap' | 'disabled';

export interface AdminApiConfig {
  mode: AdminApiMode;
  token: string | null;
}

export type AdminApiAccessDecision =
  | { allowed: true; requireFirstUser?: boolean }
  | { allowed: false; reason: 'FORBIDDEN' | 'UNAUTHORIZED' };

interface EvaluateAdminApiAccessInput {
  authUserCount: number;
  authorizationHeader: string | null;
  config: AdminApiConfig;
  operation: AdminApiOperation;
}

function extractBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokenMatches(configuredToken: string | null, suppliedToken: string | null): boolean {
  if (!configuredToken || !suppliedToken) {
    return false;
  }

  const configuredDigest = createHash('sha256').update(configuredToken).digest();
  const suppliedDigest = createHash('sha256').update(suppliedToken).digest();
  return timingSafeEqual(configuredDigest, suppliedDigest);
}

export function evaluateAdminApiAccess(input: EvaluateAdminApiAccessInput): AdminApiAccessDecision {
  if (!tokenMatches(input.config.token, extractBearerToken(input.authorizationHeader))) {
    return {
      allowed: false,
      reason: 'UNAUTHORIZED',
    };
  }

  if (input.config.mode === 'disabled') {
    return {
      allowed: false,
      reason: 'FORBIDDEN',
    };
  }

  if (input.config.mode === 'bootstrap') {
    if (input.operation === 'create-user' && input.authUserCount === 0) {
      return {
        allowed: true,
        requireFirstUser: true,
      };
    }

    return {
      allowed: false,
      reason: 'FORBIDDEN',
    };
  }

  return {
    allowed: true,
  };
}

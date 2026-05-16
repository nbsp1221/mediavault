import { describe, expect, test } from 'vitest';
import { evaluateAdminApiAccess } from './admin-api-access.policy';

describe('evaluateAdminApiAccess', () => {
  test('rejects missing and wrong bearer tokens', () => {
    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: null,
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: false,
      reason: 'UNAUTHORIZED',
    });

    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: 'Bearer wrong-token',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: false,
      reason: 'UNAUTHORIZED',
    });

    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: 'Token Bearer secret-token',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: false,
      reason: 'UNAUTHORIZED',
    });
  });

  test('accepts trimmed bearer tokens with flexible whitespace', () => {
    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: '  Bearer   secret-token  ',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: true,
      requireFirstUser: true,
    });
  });

  test('forbids disabled mode even with a valid token', () => {
    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: 'Bearer secret-token',
      config: { mode: 'disabled', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  test('permits bootstrap create only before the first account exists', () => {
    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: 'Bearer secret-token',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: true,
      requireFirstUser: true,
    });

    expect(evaluateAdminApiAccess({
      authUserCount: 1,
      authorizationHeader: 'Bearer secret-token',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'create-user',
    })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });

    expect(evaluateAdminApiAccess({
      authUserCount: 0,
      authorizationHeader: 'Bearer secret-token',
      config: { mode: 'bootstrap', token: 'secret-token' },
      operation: 'delete-user',
    })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  test('permits create and delete in always mode', () => {
    for (const operation of ['create-user', 'delete-user'] as const) {
      expect(evaluateAdminApiAccess({
        authUserCount: 5,
        authorizationHeader: 'Bearer secret-token',
        config: { mode: 'always', token: 'secret-token' },
        operation,
      })).toEqual({
        allowed: true,
      });
    }
  });
});

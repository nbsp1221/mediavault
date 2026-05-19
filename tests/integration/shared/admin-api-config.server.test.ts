import { describe, expect, test } from 'vitest';
import { getAdminApiConfigFromEnv } from '../../../app/shared/config/app-config.server';

describe('getAdminApiConfigFromEnv', () => {
  test('defaults to disabled with no token', () => {
    expect(getAdminApiConfigFromEnv({})).toEqual({
      mode: 'disabled',
      token: null,
    });
  });

  test('parses allowed modes and trims blank tokens', () => {
    expect(getAdminApiConfigFromEnv({
      MEDIAVAULT_ADMIN_API_MODE: ' bootstrap ',
      MEDIAVAULT_ADMIN_API_TOKEN: '  secret-token  ',
    })).toEqual({
      mode: 'bootstrap',
      token: 'secret-token',
    });

    expect(getAdminApiConfigFromEnv({
      MEDIAVAULT_ADMIN_API_MODE: 'always',
      MEDIAVAULT_ADMIN_API_TOKEN: '   ',
    })).toEqual({
      mode: 'always',
      token: null,
    });
  });

  test('throws without leaking token values for invalid modes', () => {
    expect(() => getAdminApiConfigFromEnv({
      MEDIAVAULT_ADMIN_API_MODE: 'forever',
      MEDIAVAULT_ADMIN_API_TOKEN: 'do-not-leak',
    })).toThrow('MEDIAVAULT_ADMIN_API_MODE');

    try {
      getAdminApiConfigFromEnv({
        MEDIAVAULT_ADMIN_API_MODE: 'forever',
        MEDIAVAULT_ADMIN_API_TOKEN: 'do-not-leak',
      });
    }
    catch (error) {
      expect(String(error)).not.toContain('do-not-leak');
    }
  });
});

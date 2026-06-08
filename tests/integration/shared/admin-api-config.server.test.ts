import { describe, expect, test } from 'vitest';
import { getAdminApiConfig } from '../../../app/shared/config/app-config.server';

describe('getAdminApiConfig', () => {
  test('defaults to disabled with no token', () => {
    expect(getAdminApiConfig({})).toEqual({
      mode: 'disabled',
      token: null,
    });
  });

  test('parses allowed modes and trims blank tokens', () => {
    expect(getAdminApiConfig({
      MEDIAVAULT_ADMIN_API_MODE: ' bootstrap ',
      MEDIAVAULT_ADMIN_API_TOKEN: '  secret-token  ',
    })).toEqual({
      mode: 'bootstrap',
      token: 'secret-token',
    });

    expect(getAdminApiConfig({
      MEDIAVAULT_ADMIN_API_MODE: 'always',
      MEDIAVAULT_ADMIN_API_TOKEN: '   ',
    })).toEqual({
      mode: 'always',
      token: null,
    });
  });

  test('ignores unrelated invalid runtime settings', () => {
    expect(getAdminApiConfig({
      DASH_SEGMENT_DURATION: 'bad',
      MEDIAVAULT_ADMIN_API_MODE: 'bootstrap',
      MEDIAVAULT_ADMIN_API_TOKEN: 'secret-token',
    })).toEqual({
      mode: 'bootstrap',
      token: 'secret-token',
    });
  });

  test('throws without leaking token values for invalid modes', () => {
    expect(() => getAdminApiConfig({
      MEDIAVAULT_ADMIN_API_MODE: 'forever',
      MEDIAVAULT_ADMIN_API_TOKEN: 'do-not-leak',
    })).toThrow('MEDIAVAULT_ADMIN_API_MODE');

    try {
      getAdminApiConfig({
        MEDIAVAULT_ADMIN_API_MODE: 'forever',
        MEDIAVAULT_ADMIN_API_TOKEN: 'do-not-leak',
      });
    }
    catch (error) {
      expect(String(error)).not.toContain('do-not-leak');
    }
  });
});

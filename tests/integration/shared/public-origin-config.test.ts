import { describe, expect, test } from 'vitest';
import { getPublicOrigin, getRuntimeConfig } from '~/shared/config/app-config.server';

describe('public origin configuration', () => {
  test.each([undefined, '', '   '])(
    'leaves direct-request origin as the default for %s',
    (value) => {
      expect(getPublicOrigin({ MEDIAVAULT_PUBLIC_ORIGIN: value })).toBeUndefined();
    },
  );
  test.each([
    ['https://vault.example', 'https://vault.example'],
    [' https://Vault.Example/ ', 'https://vault.example'],
    ['https://vault.example:8443', 'https://vault.example:8443'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('normalizes %s to a single origin', (value, expected) => {
    expect(getPublicOrigin({ MEDIAVAULT_PUBLIC_ORIGIN: value })).toBe(expected);
  });
  test.each([
    'not-a-url',
    'ftp://vault.example',
    'https://user@vault.example',
    'https://vault.example/path',
    'https://vault.example?query=1',
    'https://vault.example#fragment',
  ])('rejects invalid or non-origin configuration %s', (value) => {
    const env = { MEDIAVAULT_PUBLIC_ORIGIN: value };
    expect(() => getPublicOrigin(env)).toThrow('MEDIAVAULT_PUBLIC_ORIGIN');
    expect(() => getRuntimeConfig(env)).toThrow('MEDIAVAULT_PUBLIC_ORIGIN');
  });
});

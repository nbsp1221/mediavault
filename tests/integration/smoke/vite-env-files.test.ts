import { describe, expect, test } from 'vitest';
import {
  MEDIAVAULT_DISABLE_VITE_ENV_FILES,
  resolveViteEnvDir,
} from '../../../scripts/vite-env-files';

describe('Vite env-file disabling for test entrypoints', () => {
  test('disables Vite env file loading when the Mediavault test flag is enabled', () => {
    expect(
      resolveViteEnvDir({
        [MEDIAVAULT_DISABLE_VITE_ENV_FILES]: 'true',
      }),
    ).toBe(false);
  });

  test.each(['false', '1', 'TRUE', ''])(
    'keeps default env loading when the test flag is not literal true: %j',
    (value) => {
      expect(resolveViteEnvDir({ [MEDIAVAULT_DISABLE_VITE_ENV_FILES]: value })).toBeUndefined();
    },
  );

  test('keeps Vite default env loading when the test flag is absent', () => {
    expect(resolveViteEnvDir({})).toBeUndefined();
  });
});

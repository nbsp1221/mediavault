import { describe, expect, test } from 'vitest';
import {
  LOCAL_STREAMER_DISABLE_VITE_ENV_FILES,
  MEDIAVAULT_DISABLE_VITE_ENV_FILES,
  resolveViteEnvDir,
} from '../../../scripts/vite-env-files';

describe('Vite env-file disabling for test entrypoints', () => {
  test('disables Vite env file loading when the Mediavault test flag is enabled', () => {
    expect(resolveViteEnvDir({
      [MEDIAVAULT_DISABLE_VITE_ENV_FILES]: 'true',
    })).toBe(false);
  });

  test('keeps legacy local streamer flag compatibility for existing external callers', () => {
    expect(resolveViteEnvDir({
      [LOCAL_STREAMER_DISABLE_VITE_ENV_FILES]: 'true',
    })).toBe(false);
  });

  test('keeps Vite default env loading when the test flag is absent', () => {
    expect(resolveViteEnvDir({})).toBeUndefined();
  });
});

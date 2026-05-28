import { describe, expect, test } from 'vitest';
import {
  detectPlaywrightRuntimeMode,
  PLAYWRIGHT_SMOKE_SPEC_PATHS,
} from '../../support/detect-playwright-runtime-mode';

describe('detectPlaywrightRuntimeMode', () => {
  test('selects hermetic-smoke mode for the required browser smoke command', () => {
    expect(detectPlaywrightRuntimeMode([
      'playwright',
      'test',
      PLAYWRIGHT_SMOKE_SPEC_PATHS[0],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[1],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[2],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[3],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[4],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[5],
      '--project=chromium',
    ])).toBe('hermetic-smoke');
  });

  test('selects hermetic-smoke mode when the selected spec set matches the required smoke command', () => {
    expect(detectPlaywrightRuntimeMode([
      'playwright',
      'test',
      PLAYWRIGHT_SMOKE_SPEC_PATHS[3],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[2],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[1],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[0],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[4],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[5],
      '--project=chromium',
    ])).toBe('hermetic-smoke');
  });

  test('selects developer-full mode when no explicit spec files are passed', () => {
    expect(detectPlaywrightRuntimeMode([
      'playwright',
      'test',
    ])).toBe('developer-full');
  });

  test('selects developer-full mode when any extra spec outside the smoke set is included', () => {
    expect(detectPlaywrightRuntimeMode([
      'playwright',
      'test',
      PLAYWRIGHT_SMOKE_SPEC_PATHS[0],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[1],
      PLAYWRIGHT_SMOKE_SPEC_PATHS[2],
      'tests/e2e/playlist-detail-smoke.spec.ts',
    ])).toBe('developer-full');
  });
});

import { describe, expect, test } from 'vitest';
import { collectCriticalProductionSecretIssues } from '../../../app/modules/runtime/application/production-readiness.policy';
import { getPlaybackConfig } from '../../../app/shared/config/app-config.server';
import { PUBLIC_ENV_KEYS } from '../../../app/shared/config/public-env.server';
import {
  isWeakPlaybackJwtSecret,
  MIN_PLAYBACK_JWT_SECRET_LENGTH,
} from '../../../app/shared/config/runtime-config-contract.server';
import {
  assertRuntimeTestEnvConfigurable,
  createDockerComposeRuntimeTestEnv,
  createProductionRuntimeTestEnv,
  createRuntimeTestEnv,
  withoutRuntimeEnvKey,
} from '../../support/runtime-test-env';

describe('runtime test env contract', () => {
  test('shared playback JWT weakness contract measures the trimmed secret', () => {
    const oneCharacterShort = '1'.repeat(MIN_PLAYBACK_JWT_SECRET_LENGTH - 1);
    const exactLength = '1'.repeat(MIN_PLAYBACK_JWT_SECRET_LENGTH);

    expect(isWeakPlaybackJwtSecret(` ${oneCharacterShort} `)).toBe(true);
    expect(isWeakPlaybackJwtSecret(` ${exactLength} `)).toBe(false);
  });

  test('host and Docker configured runtime fixtures satisfy production config contracts', () => {
    const hostEnv = createProductionRuntimeTestEnv();
    const dockerEnv = createDockerComposeRuntimeTestEnv();

    expect(() => assertRuntimeTestEnvConfigurable(hostEnv)).not.toThrow();
    expect(() => assertRuntimeTestEnvConfigurable(dockerEnv)).not.toThrow();
    expect(getPlaybackConfig(hostEnv).jwtSecret).toBe(hostEnv.MEDIAVAULT_PLAYBACK_JWT_SECRET);
    expect(getPlaybackConfig(dockerEnv).jwtSecret).toBe(dockerEnv.MEDIAVAULT_PLAYBACK_JWT_SECRET);
  });

  test('Docker configured runtime fixture does not inherit host process-only env', () => {
    const dockerEnv = createDockerComposeRuntimeTestEnv();

    expect(dockerEnv.PATH).toBeUndefined();
    expect(dockerEnv.HOME).toBeUndefined();
    expect(dockerEnv.TERM).toBeUndefined();
    expect(dockerEnv.TZ).toBe('Etc/UTC');
    expect(dockerEnv.LANG).toBe('C.UTF-8');
  });

  test('runtime fixture generation ignores ambient secrets', () => {
    const originalPlaybackSecret = process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
    process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = 'ambient-short-secret';

    try {
      expect(createRuntimeTestEnv().MEDIAVAULT_PLAYBACK_JWT_SECRET).not.toBe('ambient-short-secret');
      expect(() => assertRuntimeTestEnvConfigurable(createProductionRuntimeTestEnv())).not.toThrow();
    }
    finally {
      if (originalPlaybackSecret === undefined) {
        delete process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET;
      }
      else {
        process.env.MEDIAVAULT_PLAYBACK_JWT_SECRET = originalPlaybackSecret;
      }
    }
  });

  test('production fixture contract catches missing and weak playback secrets before Docker runs', () => {
    expect(collectCriticalProductionSecretIssues(
      withoutRuntimeEnvKey(createProductionRuntimeTestEnv(), PUBLIC_ENV_KEYS.playbackJwtSecret),
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing-critical-secret',
        subject: PUBLIC_ENV_KEYS.playbackJwtSecret,
      }),
    ]));

    expect(collectCriticalProductionSecretIssues(createProductionRuntimeTestEnv({
      [PUBLIC_ENV_KEYS.playbackJwtSecret]: 'short',
    }))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'weak-critical-secret',
        subject: PUBLIC_ENV_KEYS.playbackJwtSecret,
      }),
    ]));
  });
});

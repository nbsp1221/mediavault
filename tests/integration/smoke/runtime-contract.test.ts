import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { parseRuntimeContract, verifyRuntime } from '../../../scripts/verify-runtime.mts';

const contract = {
  engines: { node: '26.13.0' },
  packageManager: 'pnpm@12.16.1',
};

describe('supported runtime contract', () => {
  test.each([null, {}, { engines: { node: '26.13.0' }, packageManager: 'npm@11.0.0' }])(
    'rejects malformed package contracts',
    (value) => {
      expect(() => parseRuntimeContract(value)).toThrow('pinned Node.js and pnpm runtime contract');
    },
  );

  test('accepts the supported Node.js and pnpm pair', () => {
    expect(() =>
      verifyRuntime({
        nodeVersion: '26.13.0',
        packageManager: contract,
        userAgent: 'pnpm/12.16.1 npm/? node/v26.13.0 linux x64',
      }),
    ).not.toThrow();
  });

  test('rejects unsupported Node.js versions with an actionable message', () => {
    expect(() =>
      verifyRuntime({
        nodeVersion: '24.0.0',
        packageManager: contract,
        userAgent: 'pnpm/12.16.1',
      }),
    ).toThrow('Node.js 26.13.0 is required; current version is 24.0.0.');
  });

  test.each([undefined, 'npm/11.0.0', 'pnpm/12.0.0'])(
    'rejects an unsupported install client: %s',
    (userAgent) => {
      expect(() =>
        verifyRuntime({
          nodeVersion: '26.13.0',
          packageManager: contract,
          userAgent,
        }),
      ).toThrow('Install dependencies with pnpm 12.16.1.');
    },
  );

  test('keeps the local runtime pin aligned with the package contract', async () => {
    const packageJson = parseRuntimeContract(JSON.parse(await readFile('package.json', 'utf8')));
    expect((await readFile('.node-version', 'utf8')).trim()).toBe(packageJson.engines.node);
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});

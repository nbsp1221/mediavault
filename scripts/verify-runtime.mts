import { readFileSync } from 'node:fs';

interface PackageRuntimeContract {
  engines: { node: string };
  packageManager: string;
}

interface RuntimeVerificationInput {
  nodeVersion: string;
  packageManager: PackageRuntimeContract;
  userAgent?: string;
}

/** Verify that local installs use the same runtime and package manager as CI. */
export function verifyRuntime({
  nodeVersion,
  packageManager,
  userAgent,
}: RuntimeVerificationInput): void {
  const expectedNode = packageManager.engines.node;
  const expectedPnpm = packageManager.packageManager.replace(/^pnpm@/, '');
  const actualPnpm = /^pnpm\/(\S+)/.exec(userAgent ?? '')?.[1];

  if (nodeVersion !== expectedNode) {
    throw new Error(`Node.js ${expectedNode} is required; current version is ${nodeVersion}.`);
  }
  if (actualPnpm !== expectedPnpm) {
    throw new Error(`Install dependencies with pnpm ${expectedPnpm}.`);
  }
}

/** Validate the install contract without depending on packages that are not installed yet. */
export function parseRuntimeContract(value: unknown): PackageRuntimeContract {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('engines' in value) ||
    typeof value.engines !== 'object' ||
    value.engines === null ||
    !('node' in value.engines) ||
    typeof value.engines.node !== 'string' ||
    !('packageManager' in value) ||
    typeof value.packageManager !== 'string' ||
    !/^pnpm@\d+\.\d+\.\d+$/.test(value.packageManager)
  ) {
    throw new Error('package.json must declare a pinned Node.js and pnpm runtime contract.');
  }
  return { engines: { node: value.engines.node }, packageManager: value.packageManager };
}

if (import.meta.main) {
  const value: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const packageManager = parseRuntimeContract(value);
  verifyRuntime({
    nodeVersion: process.versions.node,
    packageManager,
    userAgent: process.env.npm_config_user_agent,
  });
}

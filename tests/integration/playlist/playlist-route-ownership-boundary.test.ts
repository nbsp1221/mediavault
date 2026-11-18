import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dependencyViolation } from '../architecture/dependency-policy';
import { readAppDependencies } from '../architecture/source-dependencies';

const PROJECT_ROOT = resolve(__dirname, '../../..');

describe('playlist route ownership boundary', () => {
  test('active playlist infrastructure does not depend on outer layers', () => {
    const dependencies = readAppDependencies(PROJECT_ROOT).filter(({ from }) =>
      from.startsWith('app/modules/playlist/infrastructure/'),
    );
    expect(dependencies.length).toBeGreaterThan(0);
    for (const dependency of dependencies) {
      expect(dependencyViolation(dependency), `${dependency.from} -> ${dependency.to}`).toBeNull();
    }
  });
});

import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dependencyViolation, pendingMediaDependencies } from './dependency-policy';
import {
  readAppDependencies,
  readCompilerOptions,
  readSourceDependencies,
} from './source-dependencies';

const root = resolve(__dirname, '../../..');
const options = readCompilerOptions(root);
const sourceFile = 'app/pages/home/ui/HomePage.tsx';
const target = 'app/modules/library/domain/library-video.ts';

describe('resolved application dependencies', () => {
  test.each([
    ["import type { LibraryVideo } from '~/modules/library/domain/library-video'", true],
    ["import { type LibraryVideo } from '~/modules/library/domain/library-video'", true],
    ["export type { LibraryVideo } from '../../../modules/library/domain/library-video'", true],
    ["export { type LibraryVideo } from '~/modules/library/domain/library-video'", true],
    ["export * from '~/modules/library/domain/library-video'", false],
    ["import '~/modules/library/domain/library-video'", false],
    ["import('~/modules/library/domain/library-video')", false],
  ])('resolves %s', (source, typeOnly) => {
    const dependencies = readSourceDependencies(root, sourceFile, source, options);
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].specifier).toEqual(
      source.includes('../../../')
        ? '../../../modules/library/domain/library-video'
        : '~/modules/library/domain/library-video',
    );
    expect(
      dependencies.map(({ from, to, typeOnly: importedType }) => ({
        from,
        to,
        typeOnly: importedType,
      })),
    ).toEqual([{ from: sourceFile, to: target, typeOnly }]);
  });

  test('fails on unresolved local imports rather than silently omitting a boundary', () => {
    expect(() =>
      readSourceDependencies(root, sourceFile, "import './missing-boundary'", options),
    ).toThrow('Unresolved local import');
    expect(
      readSourceDependencies(root, sourceFile, "import 'react'; import './page.css'", options),
    ).toEqual([]);
  });

  test.each([
    'app/modules/library/domain/fixture.ts',
    'app/modules/library/application/use-cases/fixture.ts',
    'app/pages/home/ui/fixture.tsx',
  ])('rejects infrastructure dependencies from %s, including type-only imports', (from) => {
    const [dependency] = readSourceDependencies(
      root,
      from,
      "import type { SqliteDatabaseAdapter } from '~/modules/storage/infrastructure/sqlite/primary-sqlite.database'",
      options,
    );
    expect(dependencyViolation(dependency)).toBeTruthy();
  });

  test('allows intentional browser-safe domain contracts', () => {
    const [dependency] = readSourceDependencies(
      root,
      sourceFile,
      "import type { LibraryVideo } from '~/modules/library/domain/library-video'",
      options,
    );
    expect(dependencyViolation(dependency)).toBeNull();
  });

  test.each([
    [
      'app/composition/server/fixture.server.ts',
      "export * from '~/routes/.server/playback-route-utils'",
    ],
    [
      'app/modules/library/domain/fixture.ts',
      "import('~/modules/library/application/policies/video-read-access-scope')",
    ],
    ['app/modules/library/application/fixture.ts', "import '~/shared/config/app-config.server'"],
    [sourceFile, "export type * from '~/composition/server/playback.server'"],
    [
      'app/modules/user/infrastructure/fixture.ts',
      "import '~/modules/playlist/infrastructure/sqlite/sqlite-playlist.repository'",
    ],
  ])('rejects forbidden dependencies from %s', (from, source) => {
    const [dependency] = readSourceDependencies(root, from, source, options);
    expect(dependencyViolation(dependency)).toBeTruthy();
  });

  test('application imports respect ownership and layer direction', () => {
    const dependencies = readAppDependencies(root);
    const violations = dependencies.flatMap((dependency) => {
      const reason = dependencyViolation(dependency);
      return reason ? [`${dependency.from} -> ${dependency.to}: ${reason}`] : [];
    });
    expect(violations).toEqual([]);
    // A stale exception must be removed, not retained as permission for future code.
    for (const [from, to] of pendingMediaDependencies) {
      expect(
        dependencies.some((dependency) => dependency.from === from && dependency.to === to),
        `${from} -> ${to}`,
      ).toBe(true);
    }
  });
});

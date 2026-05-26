import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const PROJECT_ROOT = resolve(__dirname, '../../..');

const RETIRED_AUTH_USER_FILES = [
  'app/modules/auth/domain/auth-user.ts',
  'app/modules/auth/domain/auth-username.ts',
  'app/modules/auth/application/ports/auth-user-repository.port.ts',
  'app/modules/auth/application/use-cases/create-auth-user.usecase.ts',
  'app/modules/auth/application/use-cases/delete-auth-user.usecase.ts',
  'app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository.ts',
] as const;

const USER_DOMAIN_APPLICATION_FILES = [
  'app/modules/user/domain/entities/user.entity.ts',
  'app/modules/user/domain/value-objects/user-id.ts',
  'app/modules/user/domain/value-objects/user-password.ts',
  'app/modules/user/domain/value-objects/username.ts',
  'app/modules/user/domain/policies/user-deletion.policy.ts',
  'app/modules/user/application/ports/user-repository.port.ts',
  'app/modules/user/application/ports/owned-video-counter.port.ts',
  'app/modules/user/application/use-cases/create-user.usecase.ts',
  'app/modules/user/application/use-cases/delete-user.usecase.ts',
] as const;

const LIBRARY_DOMAIN_APPLICATION_FILES = [
  'app/modules/library/domain/entities/video.entity.ts',
  'app/modules/library/domain/policies/video-access.policy.ts',
  'app/modules/library/domain/value-objects/video-id.ts',
  'app/modules/library/domain/value-objects/video-title.ts',
  'app/modules/library/domain/value-objects/video-visibility.ts',
  'app/modules/library/application/ports/video-repository.port.ts',
] as const;

const LIBRARY_DOMAIN_APPLICATION_ROOTS = [
  'app/modules/library/domain',
  'app/modules/library/application',
] as const;

const ROUTE_AND_PLAYBACK_ROOTS = [
  'app/routes',
  'app/modules/playback',
] as const;

const LIBRARY_FORBIDDEN_IMPORT_PATTERNS = [
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/modules\/auth(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"](?:\.\.\/)+auth(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/modules\/user\/infrastructure(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/composition(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"](?:\.\.\/)+composition(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/routes(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"](?:\.\.\/)+routes(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"]~\/modules\/playback(?:\/|['"])/,
  /(?:from|import\s*\(|require\s*\()\s*['"](?:\.\.\/)+playback(?:\/|['"])/,
] as const;

const AUTH_APPLICATION_FILES = [
  'app/modules/auth/application/use-cases/create-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/resolve-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/destroy-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/evaluate-site-access.usecase.ts',
  'app/modules/auth/application/ports/user-credential-reader.port.ts',
] as const;

const AUTH_DOMAIN_FILES = [
  'app/modules/auth/domain/auth-session.ts',
  'app/modules/auth/domain/request-viewer.ts',
  'app/modules/auth/domain/site-viewer.ts',
] as const;

const USER_FILES = [
  ...USER_DOMAIN_APPLICATION_FILES,
  'app/modules/user/infrastructure/sqlite/sqlite-user.repository.ts',
] as const;

async function pathExists(file: string) {
  try {
    await access(resolve(PROJECT_ROOT, file));
    return true;
  }
  catch {
    return false;
  }
}

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(resolve(PROJECT_ROOT, root), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const child = `${root}/${entry.name}`;

    if (entry.isDirectory()) {
      return listSourceFiles(child);
    }

    if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      return [child];
    }

    return [];
  }));

  return files.flat();
}

async function listSourceFilesFromRoots(roots: readonly string[]) {
  const files = await Promise.all(roots.map(root => listSourceFiles(root)));

  return files.flat().sort();
}

describe('user/auth/library architecture boundary', () => {
  test('retired auth-owned user lifecycle files no longer exist', async () => {
    for (const file of RETIRED_AUTH_USER_FILES) {
      await expect(pathExists(file), file).resolves.toBe(false);
    }
  });

  test('user domain and application do not import auth or infrastructure modules', async () => {
    for (const file of USER_DOMAIN_APPLICATION_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('~/modules/auth/');
      expect(source, file).not.toContain('../../../auth/');
      expect(source, file).not.toContain('/infrastructure/');
    }
  });

  test('user module does not depend back on auth', async () => {
    for (const file of USER_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('~/modules/auth/');
      expect(source, file).not.toContain('../../../auth/');
    }
  });

  test('auth application depends on a credential port instead of user infrastructure', async () => {
    for (const file of AUTH_APPLICATION_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('~/modules/user/infrastructure');
      expect(source, file).not.toContain('SqliteUserRepository');
      expect(source, file).not.toContain('CreateUserUseCase');
      expect(source, file).not.toContain('DeleteUserUseCase');
    }

    const createSessionSource = await readFile(
      resolve(PROJECT_ROOT, 'app/modules/auth/application/use-cases/create-auth-session.usecase.ts'),
      'utf8',
    );
    expect(createSessionSource).toContain('UserCredentialReader');
    expect(createSessionSource).not.toContain('UserRepository');
  });

  test('auth domain request identity does not depend on user, library, or infrastructure modules', async () => {
    for (const file of AUTH_DOMAIN_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('~/modules/user/');
      expect(source, file).not.toContain('~/modules/library/');
      expect(source, file).not.toContain('/infrastructure/');
    }
  });

  test('library domain and application do not import auth or user infrastructure', async () => {
    const files = await listSourceFilesFromRoots(LIBRARY_DOMAIN_APPLICATION_ROOTS);

    expect(files).toContain('app/modules/library/application/use-cases/update-library-video.usecase.ts');
    expect(files).toContain('app/modules/library/application/use-cases/delete-library-video.usecase.ts');

    for (const file of files) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');

      for (const pattern of LIBRARY_FORBIDDEN_IMPORT_PATTERNS) {
        expect(pattern.test(source), `${file} matched ${pattern}`).toBe(false);
      }
    }
  });

  test('request viewer to video policy viewer adapter stays in composition', async () => {
    const adapterSource = await readFile(
      resolve(PROJECT_ROOT, 'app/composition/server/video-access-viewer.ts'),
      'utf8',
    );

    expect(adapterSource).toContain('~/modules/auth/domain/request-viewer');
    expect(adapterSource).toContain('~/modules/library/domain/policies/video-access.policy');

    for (const file of LIBRARY_DOMAIN_APPLICATION_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('request-viewer');
      expect(source, file).not.toContain('RequestViewer');
    }
  });

  test('library infrastructure may implement the user-owned video counter port only as an adapter', async () => {
    const source = await readFile(
      resolve(PROJECT_ROOT, 'app/modules/library/infrastructure/sqlite/sqlite-owned-video-counter.adapter.ts'),
      'utf8',
    );

    expect(source).toContain('OwnedVideoCounterPort');
    expect(source).toContain('~/modules/user/application/ports/owned-video-counter.port');
    expect(source).not.toContain('~/modules/user/domain/');
    expect(source).not.toContain('~/modules/user/infrastructure/');
  });

  test('route and playback code do not consume video access policy internals directly', async () => {
    const files = await listSourceFilesFromRoots(ROUTE_AND_PLAYBACK_ROOTS);

    for (const file of files) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');

      expect(source, file).not.toContain('VideoAccessPolicy');
      expect(source, file).not.toContain('canAccessVideoForRead');
      expect(source, file).not.toContain('VideoViewer');
      expect(source, file).not.toContain('video-access.policy');
      expect(source, file).not.toContain('visibility ===');
      expect(source, file).not.toMatch(/visibility:\s*['"]public['"]/);
      expect(source, file).not.toContain('ownerId ===');
      expect(source, file).not.toContain('userId ===');
    }
  });
});

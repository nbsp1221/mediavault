import { access, readFile } from 'node:fs/promises';
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

const AUTH_APPLICATION_FILES = [
  'app/modules/auth/application/use-cases/create-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/resolve-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/destroy-auth-session.usecase.ts',
  'app/modules/auth/application/use-cases/evaluate-site-access.usecase.ts',
  'app/modules/auth/application/ports/user-credential-reader.port.ts',
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

  test('library domain and application do not import auth or user infrastructure', async () => {
    for (const file of LIBRARY_DOMAIN_APPLICATION_FILES) {
      const source = await readFile(resolve(PROJECT_ROOT, file), 'utf8');
      expect(source, file).not.toContain('~/modules/auth/');
      expect(source, file).not.toContain('~/modules/user/infrastructure');
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
});

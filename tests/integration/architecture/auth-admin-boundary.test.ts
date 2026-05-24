import { readdir, readFile, stat } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  }
  catch {
    return false;
  }
}

describe('auth admin architecture boundary', () => {
  test('admin routes use composition/use-case boundaries instead of SQLite infrastructure', async () => {
    const routeFiles = [
      'app/routes/api.admin.users.ts',
      'app/routes/api.admin.users.$username.ts',
    ];

    for (const routeFile of routeFiles) {
      const source = await readFile(routeFile, 'utf8');

      expect(source).not.toContain('infrastructure/sqlite');
      expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
      expect(source).toContain('getServerAdminAuthServices');
    }
  });

  test('local DB-mutating auth CLI entrypoints are not present', async () => {
    await expect(fileExists('scripts/auth-add-user.ts')).resolves.toBe(false);
    await expect(fileExists('scripts/auth-delete-user.ts')).resolves.toBe(false);
  });

  test('account-management scripts cannot bypass the server Admin API boundary', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).not.toHaveProperty('auth:add-user');
    expect(packageJson.scripts).not.toHaveProperty('auth:delete-user');

    const scriptFiles = (await readdir('scripts'))
      .filter(file => file.endsWith('.ts'))
      .filter(file => file !== 'seed-demo-storage.ts')
      .filter(file => file !== 'migrate-video-access-model.ts')
      .map(file => `scripts/${file}`);

    for (const scriptFile of scriptFiles) {
      const source = await readFile(scriptFile, 'utf8');
      expect(source).not.toMatch(/SqliteAuthUserRepository|createServerAdminAuthServices|auth_users|CreateAuthUserUseCase|DeleteAuthUserUseCase/i);
    }
  });
});

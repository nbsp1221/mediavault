import { randomUUID } from 'node:crypto';
import { input, password } from '@inquirer/prompts';
import { validateAuthPassword } from '../app/modules/auth/domain/auth-password-policy';
import { createAuthUsername } from '../app/modules/auth/domain/auth-username';
import { Argon2PasswordHashService } from '../app/modules/auth/infrastructure/password/argon2-password-hash.service';
import { getPrimaryStorageConfig } from '../app/modules/storage/infrastructure/config/storage-config.server';
import { createMigratedPrimarySqliteDatabase } from '../app/modules/storage/infrastructure/sqlite/migrated-primary-sqlite.database';

export type AddAuthUserResult =
  | { ok: true; userId: string; username: string }
  | {
    ok: false;
    reason:
      | 'INVALID_PASSWORD'
      | 'INVALID_USERNAME'
      | 'PASSWORD_CONFIRMATION_MISMATCH'
      | 'USERNAME_ALREADY_EXISTS';
  };

export async function addAuthUser(inputData: {
  confirmPassword: string;
  dbPath?: string;
  now?: Date;
  password: string;
  userId?: string;
  username: string;
}): Promise<AddAuthUserResult> {
  const username = createAuthUsername(inputData.username);
  if ('ok' in username) {
    return {
      ok: false,
      reason: 'INVALID_USERNAME',
    };
  }

  if (inputData.password !== inputData.confirmPassword) {
    return {
      ok: false,
      reason: 'PASSWORD_CONFIRMATION_MISMATCH',
    };
  }

  const passwordValidation = validateAuthPassword(inputData.password);
  if (!passwordValidation.ok) {
    return {
      ok: false,
      reason: 'INVALID_PASSWORD',
    };
  }

  const database = await createMigratedPrimarySqliteDatabase({
    dbPath: inputData.dbPath ?? getPrimaryStorageConfig().databasePath,
  });

  const passwordHash = await new Argon2PasswordHashService().hash(inputData.password);
  const userId = inputData.userId ?? randomUUID();
  const createdAt = inputData.now ?? new Date();
  const result = await database.transaction(async (transaction) => {
    const existingUser = await transaction.prepare(`
      SELECT id
      FROM auth_users
      WHERE username_key = ?
    `).get(username.usernameKey);

    if (existingUser) {
      return null;
    }

    const userCount = await transaction.prepare<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM auth_users
    `).get();

    await transaction.prepare(`
      INSERT INTO auth_users (
        id,
        username,
        username_key,
        password_hash,
        role,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username.username,
      username.usernameKey,
      passwordHash,
      'admin',
      createdAt.toISOString(),
    );

    if ((userCount?.count ?? 0) === 0) {
      await transaction.prepare(`
        UPDATE playlists
        SET owner_id = ?
      `).run(userId);
    }

    return {
      id: userId,
      username: username.username,
    };
  });

  if (!result) {
    return {
      ok: false,
      reason: 'USERNAME_ALREADY_EXISTS',
    };
  }

  return {
    ok: true,
    userId: result.id,
    username: result.username,
  };
}

function formatAddUserFailure(result: Exclude<AddAuthUserResult, { ok: true }>): string {
  switch (result.reason) {
    case 'INVALID_PASSWORD':
      return 'Password must be between 4 and 64 characters.';
    case 'INVALID_USERNAME':
      return 'Username is required and cannot contain path separators, null bytes, or "..".';
    case 'PASSWORD_CONFIRMATION_MISMATCH':
      return 'Password confirmation does not match.';
    case 'USERNAME_ALREADY_EXISTS':
      return 'Username already exists.';
  }
}

async function main() {
  const username = await input({
    message: 'Username',
    required: true,
  });
  const enteredPassword = await password({
    mask: true,
    message: 'Password',
  });
  const confirmPassword = await password({
    mask: true,
    message: 'Confirm password',
  });

  const result = await addAuthUser({
    confirmPassword,
    password: enteredPassword,
    username,
  });

  if (!result.ok) {
    console.error(formatAddUserFailure(result));
    process.exit(1);
  }

  console.log(`Created user ${result.username}`);
}

if (import.meta.main) {
  main().catch((error) => {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log('\nCancelled.');
      process.exit(0);
    }

    console.error(error);
    process.exit(1);
  });
}

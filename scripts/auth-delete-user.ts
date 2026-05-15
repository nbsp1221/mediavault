import { confirm, input } from '@inquirer/prompts';
import { createAuthUsername } from '../app/modules/auth/domain/auth-username';
import { SqliteAuthUserRepository } from '../app/modules/auth/infrastructure/sqlite/sqlite-auth-user.repository';
import { getPrimaryStorageConfig } from '../app/modules/storage/infrastructure/config/storage-config.server';

export type DeleteAuthUserResult =
  | { ok: true; username: string }
  | { ok: false; reason: 'INVALID_USERNAME' | 'USER_NOT_FOUND' };

export async function deleteAuthUser(inputData: {
  dbPath?: string;
  username: string;
}): Promise<DeleteAuthUserResult> {
  const username = createAuthUsername(inputData.username);
  if ('ok' in username) {
    return {
      ok: false,
      reason: 'INVALID_USERNAME',
    };
  }

  const repository = new SqliteAuthUserRepository({
    dbPath: inputData.dbPath ?? getPrimaryStorageConfig().databasePath,
  });
  const existing = await repository.findByUsernameKey(username.usernameKey);

  if (!existing) {
    return {
      ok: false,
      reason: 'USER_NOT_FOUND',
    };
  }

  await repository.deleteByUsernameKey(username.usernameKey);

  return {
    ok: true,
    username: existing.username,
  };
}

function formatDeleteUserFailure(result: Exclude<DeleteAuthUserResult, { ok: true }>): string {
  switch (result.reason) {
    case 'INVALID_USERNAME':
      return 'Username is required and cannot contain path separators, null bytes, or "..".';
    case 'USER_NOT_FOUND':
      return 'User not found.';
  }
}

async function main() {
  const username = await input({
    message: 'Username to delete',
    required: true,
  });
  const confirmed = await confirm({
    default: false,
    message: `Delete user "${username}"?`,
  });

  if (!confirmed) {
    console.log('Cancelled.');
    return;
  }

  const result = await deleteAuthUser({ username });

  if (!result.ok) {
    console.error(formatDeleteUserFailure(result));
    process.exit(1);
  }

  console.log(`Deleted user ${result.username}`);
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

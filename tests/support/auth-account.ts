import { addAuthUser } from '../../scripts/auth-add-user';

export const E2E_AUTH_USERNAME = 'owner';
export const E2E_AUTH_PASSWORD = 'vault-password';
export const E2E_AUTH_USER_ID = 'seeded-owner-1';

export async function seedRuntimeAuthUser(databasePath: string, input: {
  password?: string;
  userId?: string;
  username?: string;
} = {}) {
  const username = input.username ?? E2E_AUTH_USERNAME;
  const password = input.password ?? E2E_AUTH_PASSWORD;
  const userId = input.userId ?? E2E_AUTH_USER_ID;
  const result = await addAuthUser({
    confirmPassword: password,
    dbPath: databasePath,
    now: new Date('2026-03-08T00:00:00.000Z'),
    password,
    userId,
    username,
  });

  if (!result.ok && result.reason !== 'USERNAME_ALREADY_EXISTS') {
    throw new Error(`Failed to seed auth user: ${result.reason}`);
  }
}

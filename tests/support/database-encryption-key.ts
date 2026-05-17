export const TEST_DATABASE_ENCRYPTION_KEY = 'mediavault-test-database-encryption-key';

export function installTestDatabaseEncryptionKey(): void {
  process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = TEST_DATABASE_ENCRYPTION_KEY;
}

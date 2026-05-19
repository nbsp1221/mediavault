export const TEST_DATABASE_ENCRYPTION_KEY = 'mediavault-test-database-encryption-key';
export const TEST_MEDIA_KEY_DERIVATION_SECRET = 'mediavault-test-media-key-derivation-secret';

export function installTestDatabaseEncryptionKey(): void {
  process.env.MEDIAVAULT_DATABASE_ENCRYPTION_KEY = TEST_DATABASE_ENCRYPTION_KEY;
}

export function installTestMediaKeyDerivationSecret(): void {
  process.env.MEDIAVAULT_MEDIA_KEY_DERIVATION_SECRET = TEST_MEDIA_KEY_DERIVATION_SECRET;
}

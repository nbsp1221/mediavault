import { describe, expect, test } from 'vitest';
import { Argon2PasswordHashService } from './argon2-password-hash.service';

describe('Argon2PasswordHashService', () => {
  test('hashes passwords as Argon2id PHC strings and verifies them', async () => {
    const service = new Argon2PasswordHashService();

    const hash = await service.hash('correct-password');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify({
      hash,
      password: 'correct-password',
    })).resolves.toBe(true);
    await expect(service.verify({
      hash,
      password: 'wrong-password',
    })).resolves.toBe(false);
  });
});

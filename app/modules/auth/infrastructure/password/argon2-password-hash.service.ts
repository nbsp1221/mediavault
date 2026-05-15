import argon2 from 'argon2';
import type { PasswordHashService } from '../../application/ports/password-hash-service.port';

export class Argon2PasswordHashService implements PasswordHashService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
    });
  }

  async verify(input: {
    hash: string;
    password: string;
  }): Promise<boolean> {
    return argon2.verify(input.hash, input.password);
  }
}

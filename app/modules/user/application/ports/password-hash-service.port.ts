export interface PasswordHashService {
  hash(password: string): Promise<string>;
}

export interface PasswordHashService {
  hash: (password: string) => Promise<string>;
  verify: (input: {
    hash: string;
    password: string;
  }) => Promise<boolean>;
}

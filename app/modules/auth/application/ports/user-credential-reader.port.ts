export interface UserCredential {
  id: string;
  passwordHash: string;
  usernameKey: string;
}

export interface UserCredentialReader {
  findCredentialByUsernameKey(usernameKey: string): Promise<UserCredential | null>;
}

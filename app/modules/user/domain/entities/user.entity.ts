export interface User {
  createdAt: Date;
  id: string;
  passwordHash: string;
  username: string;
  usernameKey: string;
}

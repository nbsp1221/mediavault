export interface User {
  createdAt: Date;
  id: string;
  passwordHash: string;
  role: 'admin' | 'user';
  username: string;
  usernameKey: string;
}

import { useRouteLoaderData } from 'react-router';

export interface RootUser {
  id: string;
  role: 'admin' | 'user';
  username: string;
}

export function useRootUser(): RootUser | null {
  const data = useRouteLoaderData('root') as { user?: RootUser | null } | undefined;
  return data?.user ?? null;
}

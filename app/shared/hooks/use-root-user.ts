import { useRouteLoaderData } from 'react-router';
import type { loader } from '~/root';

export interface RootUser {
  id: string;
  username: string;
}

export function useRootUser(): RootUser | null {
  const data = useRouteLoaderData<typeof loader>('root');
  return data?.user ?? null;
}

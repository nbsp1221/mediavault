import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { LoginPage } from '~/pages/login/ui/LoginPage';
import { getAuthClientCookieHeaderForRequest } from '~/routes/.server/auth-client-identity';

export function loader({ request }: LoaderFunctionArgs) {
  const authClientCookie = getAuthClientCookieHeaderForRequest(request);

  return Response.json(
    {},
    authClientCookie
      ? {
          headers: {
            'Set-Cookie': authClientCookie,
          },
        }
      : undefined,
  );
}

export const meta: MetaFunction = () => [
  { title: 'Login - Mediavault' },
  { name: 'description', content: 'Sign in to your Mediavault account' },
];

export default function LoginRoute() {
  return <LoginPage />;
}

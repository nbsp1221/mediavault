import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { getAuthClientCookieHeaderForRequest } from '~/composition/server/auth-client-identity';
import { LoginPage } from '~/pages/login/ui/LoginPage';

export async function loader(_args: LoaderFunctionArgs) {
  const request = _args.request;
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

export const meta: MetaFunction = () => ([
  { title: 'Login - Mediavault' },
  { name: 'description', content: 'Sign in to your Mediavault account' },
]);

export default function LoginRoute() {
  return <LoginPage />;
}

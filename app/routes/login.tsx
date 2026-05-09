import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { getAuthClientCookieHeaderForRequest } from '~/composition/server/auth-client-identity';
import { LoginPage } from '~/pages/login/ui/LoginPage';
import { getAuthRuntimeState } from '~/shared/config/auth.server';

export async function loader(_args: LoaderFunctionArgs) {
  const request = _args.request;
  const authRuntimeState = getAuthRuntimeState();
  const authClientCookie = getAuthClientCookieHeaderForRequest(request);

  return Response.json(
    {
      authConfigured: authRuntimeState.isConfigured,
      configurationError: authRuntimeState.configurationError,
    },
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
  const { authConfigured, configurationError } = useLoaderData<typeof loader>();

  return (
    <LoginPage
      authConfigured={authConfigured}
      configurationError={configurationError}
    />
  );
}

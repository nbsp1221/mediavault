import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import {
  createClearedSessionCookieHeader,
  getServerSessionServices,
  getSiteSessionId,
} from '~/composition/server/auth';
import { rejectCrossOriginMutation } from '~/shared/lib/http/csrf.server';
import { getSafeRedirectTarget } from '~/shared/lib/http/redirects.server';

function getLogoutRedirectTo(request: Request): string {
  return getSafeRedirectTarget(request, '/login');
}

async function performLogout(request: Request): Promise<Response> {
  try {
    const authServices = getServerSessionServices();

    await authServices.destroyAuthSession.execute({
      sessionId: getSiteSessionId(request),
    });

    return redirect(getLogoutRedirectTo(request), {
      headers: {
        'Set-Cookie': createClearedSessionCookieHeader(),
      },
    });
  } catch {
    return Response.json(
      { error: 'Logout could not be completed. Try again.', success: false },
      {
        headers: { 'Cache-Control': 'no-store' },
        status: 503,
      },
    );
  }
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const csrfResponse = rejectCrossOriginMutation(request);
  if (csrfResponse) {
    return csrfResponse;
  }
  return performLogout(request);
}

export function loader(_args: LoaderFunctionArgs): Response {
  return new Response(null, {
    headers: { 'Allow': 'POST', 'Cache-Control': 'no-store' },
    status: 405,
  });
}

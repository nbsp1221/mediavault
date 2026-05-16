import type { ActionFunctionArgs } from 'react-router';
import { getServerAdminAuthServices } from '~/composition/server/auth';

function createAdminAccessResponse(reason: 'FORBIDDEN' | 'UNAUTHORIZED'): Response {
  return Response.json(
    {
      error: reason === 'UNAUTHORIZED' ? 'Unauthorized' : 'Forbidden',
      success: false,
    },
    {
      status: reason === 'UNAUTHORIZED' ? 401 : 403,
    },
  );
}

export async function action({ params, request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== 'DELETE') {
    return Response.json(
      { error: 'Method not allowed', success: false },
      { status: 405 },
    );
  }

  const authServices = getServerAdminAuthServices();
  const access = await authServices.evaluateAdminApiAccess({
    authorizationHeader: request.headers.get('Authorization'),
    operation: 'delete-user',
  });

  if (!access.allowed) {
    return createAdminAccessResponse(access.reason);
  }

  const username = params.username;
  if (!username) {
    return Response.json(
      { error: 'Username is required', success: false },
      { status: 400 },
    );
  }

  const result = await authServices.deleteAuthUser.execute({
    username,
  });

  if (!result.ok) {
    return Response.json(
      { error: result.reason, success: false },
      {
        status: result.reason === 'USER_NOT_FOUND' ? 404 : 400,
      },
    );
  }

  return new Response(null, { status: 204 });
}

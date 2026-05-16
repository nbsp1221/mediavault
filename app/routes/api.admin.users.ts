import type { ActionFunctionArgs } from 'react-router';
import { getServerAdminAuthServices } from '~/composition/server/auth';

interface CreateAdminUserBody {
  password?: unknown;
  username?: unknown;
}

async function readCreateUserBody(request: Request): Promise<CreateAdminUserBody | null> {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await request.json() as CreateAdminUserBody;
  }
  catch {
    return null;
  }
}

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

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed', success: false },
      { status: 405 },
    );
  }

  const authServices = getServerAdminAuthServices();
  const access = await authServices.evaluateAdminApiAccess({
    authorizationHeader: request.headers.get('Authorization'),
    operation: 'create-user',
  });

  if (!access.allowed) {
    return createAdminAccessResponse(access.reason);
  }

  const body = await readCreateUserBody(request);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return Response.json(
      { error: 'Username and password are required', success: false },
      { status: 400 },
    );
  }

  const result = await authServices.createAuthUser.execute({
    password: body.password,
    requireFirstUser: access.requireFirstUser,
    username: body.username,
  });

  if (!result.ok) {
    const status = result.reason === 'USERNAME_ALREADY_EXISTS'
      ? 409
      : result.reason === 'AUTH_USERS_ALREADY_EXIST'
        ? 403
        : 400;
    return Response.json(
      { error: result.reason, success: false },
      { status },
    );
  }

  return Response.json(
    {
      user: {
        id: result.user.id,
        role: result.user.role,
        username: result.user.username,
      },
    },
    { status: 201 },
  );
}

import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { createSessionCookieHeader, getServerAuthServices } from '~/composition/server/auth';
import {
  getAuthClientCookieHeaderForRequest,
  getLoginAttemptKeys,
  getTrustedClientIP,
} from '~/composition/server/auth-client-identity';
import { rejectCrossOriginMutation } from '~/shared/lib/http/csrf.server';

const credentialsSchema = z.object({ password: z.string(), username: z.string() });

async function extractCredentials(request: Request): Promise<{
  password: string | null;
  username: string | null;
}> {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { password: null, username: null };
    }
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      return { password: null, username: null };
    }
    return { password: parsed.data.password, username: parsed.data.username.trim() || null };
  }

  const formData = await request.formData();
  const password = formData.get('password');
  const username = formData.get('username');

  return {
    password: typeof password === 'string' ? password : null,
    username: typeof username === 'string' ? username.trim() : null,
  };
}

function createLoginResponseHeaders(request: Request, additionalCookies: string[] = []): Headers {
  const headers = new Headers();
  const authClientCookie = getAuthClientCookieHeaderForRequest(request);

  if (authClientCookie) {
    headers.append('Set-Cookie', authClientCookie);
  }

  for (const cookie of additionalCookies) {
    headers.append('Set-Cookie', cookie);
  }

  return headers;
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const csrfResponse = rejectCrossOriginMutation(request);
  if (csrfResponse) {
    return csrfResponse;
  }

  try {
    const { password, username } = await extractCredentials(request);

    if (!username || !password) {
      return Response.json(
        {
          success: false,
          error: 'Username and password are required',
        },
        { status: 400 },
      );
    }

    const authServices = getServerAuthServices();
    const result = await authServices.createAuthSession.execute({
      attemptKeys: getLoginAttemptKeys(request),
      ipAddress: getTrustedClientIP(request),
      now: new Date(),
      password,
      username,
      userAgent: request.headers.get('User-Agent') || undefined,
    });

    if (!result.ok) {
      if (result.reason === 'RATE_LIMITED') {
        return Response.json(
          { success: false, error: 'Too many login attempts. Try again later.' },
          {
            headers: (() => {
              const headers = createLoginResponseHeaders(request);
              headers.set('Retry-After', String(result.retryAfterSeconds));
              return headers;
            })(),
            status: 429,
          },
        );
      }

      return Response.json(
        { success: false, error: 'Invalid username or password' },
        {
          headers: createLoginResponseHeaders(request),
          status: 401,
        },
      );
    }

    return Response.json(
      {
        success: true,
        user: await authServices.resolveSiteViewerByUserId(result.session.userId),
      },
      {
        headers: createLoginResponseHeaders(request, [
          createSessionCookieHeader(result.session.id),
        ]),
      },
    );
  } catch (error) {
    console.error('Login error:', error);

    return Response.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 },
    );
  }
}

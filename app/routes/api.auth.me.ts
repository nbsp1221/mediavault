import type { LoaderFunctionArgs } from 'react-router';
import { getOptionalSiteViewer } from '~/composition/server/auth';
export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  try {
    const user = await getOptionalSiteViewer(request);

    if (!user) {
      return Response.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      );
    }

    return Response.json({
      success: true,
      user,
    });
  }
  catch (error) {
    console.error('Get current user error:', error);

    return Response.json(
      { success: false, error: 'Failed to get user information' },
      { status: 500 },
    );
  }
}

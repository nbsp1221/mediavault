import type { ActionFunctionArgs } from 'react-router';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'DELETE') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: { Allow: 'DELETE' } },
    );
  }
  const session = await requireProtectedApiSessionValue(request);
  if (session instanceof Response) {
    return session;
  }
  if (!params.id || !params.videoId) {
    return Response.json(
      { success: false, error: 'Playlist ID and video ID are required' },
      { status: 400 },
    );
  }
  const result = await getServerPlaylistServices().removeVideoFromPlaylist.execute({
    ownerId: session.userId,
    playlistId: params.id,
    videoId: params.videoId,
  });
  return result.success
    ? Response.json({ ...result.data, success: true })
    : Response.json({ success: false, error: result.error }, { status: result.status });
}

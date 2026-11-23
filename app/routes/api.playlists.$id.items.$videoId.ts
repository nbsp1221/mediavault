import type { ActionFunctionArgs } from 'react-router';
import { getServerPlaylistServices } from '~/composition/server/playlist.server';
import { requireProtectedApiSessionValue } from '~/routes/.server/auth-session-http';
import { playlistFailureResponse } from '~/routes/.server/playlist-http';

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
  return result.ok
    ? Response.json({ ...result.data, success: true })
    : playlistFailureResponse(result);
}

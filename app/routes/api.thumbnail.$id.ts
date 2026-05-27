import { requireProtectedMediaSessionValue } from '~/composition/server/auth';
import { loadDecryptedThumbnailResponse } from '~/composition/server/thumbnails';
import { toAuthenticatedVideoPolicyViewer } from '~/composition/server/video-access-viewer';

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const mediaSession = await requireProtectedMediaSessionValue(request);
  if ('response' in mediaSession) return mediaSession.response;

  return loadDecryptedThumbnailResponse({
    eTagPrefix: 'thumbnail',
    request,
    viewer: toAuthenticatedVideoPolicyViewer(mediaSession.session),
    videoId: params.id,
  });
}

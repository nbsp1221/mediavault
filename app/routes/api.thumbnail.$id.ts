import { loadDecryptedThumbnailResponse } from '~/composition/server/thumbnails.server';
import { resolvePublicVideoAccess } from '~/routes/.server/auth-session-http';

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const publicRouteViewer = await resolvePublicVideoAccess(request);

  return loadDecryptedThumbnailResponse({
    eTagPrefix: 'thumbnail',
    request,
    viewer: publicRouteViewer.viewer,
    videoId: params.id,
  });
}

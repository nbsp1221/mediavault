import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { loadDecryptedThumbnailResponse } from '~/composition/server/thumbnails';

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const publicRouteViewer = await resolvePublicVideoAccess(request);

  return loadDecryptedThumbnailResponse({
    eTagPrefix: 'thumbnail',
    request,
    viewer: publicRouteViewer.viewer,
    videoId: params.id,
  });
}

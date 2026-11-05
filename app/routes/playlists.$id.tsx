import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data, isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';
import { PlaylistDetailPage } from '~/pages/playlist-detail/ui/PlaylistDetailPage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await resolvePublicVideoAccess(request);
  if (!params.id) {
    throw new Response('Playlist not found', { headers: access.headers, status: 404 });
  }
  const result = await getServerPlaylistServices().getPlaylistDetails.execute({
    includeRelated: true,
    includeVideos: true,
    playlistId: params.id,
    ownerId: access.viewer.type === 'authenticated' ? access.viewer.userId : undefined,
    videoLimit: 50,
    videoOffset: 0,
  });
  if (!result.success) {
    throw new Response(result.status === 404 ? 'Playlist not found' : 'Unable to load playlist', {
      headers: access.headers,
      status: result.status,
    });
  }
  return data(result.data, { headers: access.headers });
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;
export const meta: MetaFunction = () => [{ title: 'Playlist - Mediavault' }];

export default function PlaylistDetailRoute() {
  const details = useLoaderData<typeof loader>();
  return <PlaylistDetailPage {...details} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <ProductRouteErrorView
      activeRoute="playlists"
      title={missing ? 'Playlist not found' : 'Unable to load playlist'}
      description={missing ? 'This playlist is not available.' : 'Please try again.'}
      actions={[
        { label: 'Playlists', to: '/playlists' },
        { label: 'Videos', to: '/' },
      ]}
    />
  );
}

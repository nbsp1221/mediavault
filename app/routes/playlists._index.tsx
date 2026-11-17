import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data, useLoaderData } from 'react-router';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';
import { PlaylistsPage } from '~/pages/playlists/ui/PlaylistsPage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await resolvePublicVideoAccess(request);
  const searchQuery = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (searchQuery.length > 255) {
    throw new Response('Invalid search query', { headers: access.headers, status: 400 });
  }
  const result = await getServerPlaylistServices().findPlaylists.execute({
    filters: { searchQuery: searchQuery || undefined },
    includeEmpty: true,
    limit: 20,
    offset: 0,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    ownerId: access.viewer.type === 'authenticated' ? access.viewer.userId : undefined,
  });
  if (!result.success) {
    throw new Response('Unable to load playlists', {
      headers: access.headers,
      status: result.status,
    });
  }
  return data(
    {
      playlists: result.data.playlists,
      searchQuery,
      total: result.data.totalCount,
      hasMore: result.data.hasMore,
    },
    { headers: access.headers },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;
export const meta: MetaFunction = () => [{ title: 'Playlists - Mediavault' }];

export default function Playlists() {
  const data = useLoaderData<typeof loader>();
  return <PlaylistsPage {...data} />;
}

export function ErrorBoundary() {
  return (
    <ProductRouteErrorView
      activeRoute="playlists"
      title="Unable to load playlists"
      description="Please try again."
      actions={[
        { label: 'Try again', to: '/playlists' },
        { label: 'Videos', to: '/' },
      ]}
    />
  );
}

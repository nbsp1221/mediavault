import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';
import { PlaylistsPage } from '~/pages/playlists/ui/PlaylistsPage';
import { RouteErrorView } from '~/shared/ui/route-error-view';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load playlists';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authSession = await requireProtectedPageSession(request);

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('q') || '';
  const ownerId = authSession.userId;
  const services = getServerPlaylistServices();
  const result = await services.findPlaylists.execute({
    filters: {
      genre: [],
      searchQuery: searchQuery || undefined,
      seriesName: undefined,
      status: undefined,
      type: undefined,
    },
    includeEmpty: true,
    includeStats: false,
    limit: 20,
    offset: 0,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    ownerId,
  });

  if (!result.success) {
    throw new Error(getErrorMessage(result));
  }

  const videoCountMap: Record<string, number> = {};
  result.data.playlists.forEach((playlist: { id: string; videoIds?: string[] }) => {
    videoCountMap[playlist.id] = playlist.videoIds?.length || 0;
  });

  return {
    playlists: result.data.playlists,
    searchQuery,
    total: result.data.totalCount,
    videoCountMap,
  };
}

export const meta: MetaFunction = () => ([
  { title: 'Playlists - Mediavault' },
  { name: 'description', content: 'Manage your video playlists' },
]);

export default function Playlists() {
  const { playlists, videoCountMap, total, searchQuery } = useLoaderData<typeof loader>();

  return (
    <PlaylistsPage
      playlists={playlists}
      videoCountMap={videoCountMap}
      total={total}
      searchQuery={searchQuery}
      onSearchChange={() => {}}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <RouteErrorView
        tone="warning"
        icon={<RefreshCw className="h-6 w-6" aria-hidden />}
        title="We couldn’t load your playlists"
        description={
          typeof error.data === 'string'
            ? <p>{error.data}</p>
            : <p>Please check your connection and try again.</p>
        }
        actions={[
          { label: 'Try again', to: '/playlists' },
          { label: 'Go to home', to: '/', variant: 'outline' },
        ]}
      />
    );
  }

  return (
    <RouteErrorView
      tone="critical"
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="Something went wrong"
      description={
        error instanceof Error
          ? error.message
          : 'We weren’t able to display your playlists right now. Please try again soon.'
      }
      actions={[
        { label: 'Try again', to: '/playlists' },
        { label: 'Go to home', to: '/', variant: 'outline' },
      ]}
    />
  );
}

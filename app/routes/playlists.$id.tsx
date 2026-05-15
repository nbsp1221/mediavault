import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, FileWarning, Lock } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';
import { PlaylistDetailPage } from '~/pages/playlist-detail/ui/PlaylistDetailPage';
import { RouteErrorView } from '~/shared/ui/route-error-view';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const authSession = await requireProtectedPageSession(request);

  const playlistId = params.id;
  if (!playlistId) {
    throw new Response('Playlist ID is required', { status: 400 });
  }

  const ownerId = authSession.userId;
  const services = getServerPlaylistServices();
  const result = await services.getPlaylistDetails.execute({
    includeRelated: false,
    includeStats: true,
    includeVideos: true,
    playlistId,
    ownerId,
    videoLimit: 50,
    videoOffset: 0,
  });

  if (!result.success) {
    throw new Response(result.error, {
      status: result.status,
    });
  }

  return {
    permissions: result.data.permissions ?? {},
    playlist: result.data.playlist,
    relatedPlaylists: Array.isArray(result.data.relatedPlaylists) ? result.data.relatedPlaylists : [],
    stats: result.data.stats ?? null,
    videoPagination: result.data.videoPagination ?? null,
  } as const;
}

export const meta: MetaFunction = () => ([
  { title: 'Playlist Detail - Mediavault' },
  { name: 'description', content: 'View playlist information and videos' },
]);

export default function PlaylistDetailRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <PlaylistDetailPage
      playlist={data.playlist}
      stats={data.stats}
      relatedPlaylists={data.relatedPlaylists}
      videoPagination={data.videoPagination}
      permissions={data.permissions}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) {
      return (
        <RouteErrorView
          tone="warning"
          icon={<Lock className="h-6 w-6" aria-hidden />}
          title="This playlist is private"
          description={(
            <p>
              The owner hasn’t shared this playlist yet. Ask them to invite you or explore public collections instead.
            </p>
          )}
          actions={[
            { label: 'Explore public playlists', to: '/playlists' },
            { label: 'Back to library', to: '/', variant: 'outline' },
          ]}
          footnote="If you believe you should have access, contact the playlist owner for an invitation."
        />
      );
    }

    if (error.status === 404) {
      return (
        <RouteErrorView
          icon={<FileWarning className="h-6 w-6" aria-hidden />}
          title="Playlist not found"
          description={<p>The playlist might have been removed or the link could be incorrect. Try a different collection instead.</p>}
          actions={[
            { label: 'Browse playlists', to: '/playlists' },
            { label: 'Go to library', to: '/', variant: 'outline' },
          ]}
        />
      );
    }
  }

  return (
    <RouteErrorView
      tone="critical"
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="We couldn’t open this playlist"
      description={
        error instanceof Error
          ? error.message
          : 'Something unexpected happened while loading the playlist. Please try again shortly.'
      }
      actions={[
        { label: 'Try again', to: '/playlists', variant: 'secondary' },
        { label: 'Go to home', to: '/', variant: 'outline' },
      ]}
    />
  );
}

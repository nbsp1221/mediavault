import { AlertTriangle, ShieldAlert, VideoOff } from 'lucide-react';
import { data, isRouteErrorResponse, useRouteError } from 'react-router';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import type { PlayerVideo } from '~/pages/player/model/player-video';
import { getServerPlaybackServices } from '~/composition/server/playback.server';
import { loadPlaylistPlaybackQueue } from '~/composition/server/playlist.server';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import { PlayerPage } from '~/pages/player/ui/PlayerPage';
import { resolvePublicVideoAccess } from '~/routes/.server/auth-session-http';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';
import type { Route } from './+types/player.$id';

function toPlayerVideo(video: PlaybackCatalogVideo): PlayerVideo {
  return {
    createdAt: video.createdAt,
    description: video.description,
    duration: video.duration,
    id: video.id,
    tags: video.tags,
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    videoUrl: video.videoUrl,
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const publicRouteViewer = await resolvePublicVideoAccess(request);
  publicRouteViewer.headers.set('Referrer-Policy', 'no-referrer');

  const videoId = params.id;
  if (!videoId) {
    throw new Response('Video ID is required', {
      headers: publicRouteViewer.headers,
      status: 400,
    });
  }

  const playbackServices = getServerPlaybackServices();
  const result = await playbackServices.resolvePlayerVideo.execute({
    readScope: createVideoReadAccessScope(publicRouteViewer.viewer),
    videoId,
  });

  if (!result.ok) {
    throw new Response('Video not found', {
      headers: publicRouteViewer.headers,
      status: 404,
    });
  }

  const playlistId = new URL(request.url).searchParams.get('playlist');
  const queue = playlistId
    ? await loadPlaylistPlaybackQueue({ playlistId, viewer: publicRouteViewer.viewer })
    : null;
  const playlist = queue?.ok && queue.data.videoIds.includes(videoId) ? queue.data : null;

  return data(
    {
      playlist,
      relatedVideos: result.relatedVideos.map(toPlayerVideo),
      video: toPlayerVideo(result.video),
    },
    {
      headers: publicRouteViewer.headers,
    },
  );
}

export const headers: Route.HeadersFunction = ({ loaderHeaders, errorHeaders }) =>
  errorHeaders ?? loaderHeaders;

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) {
    return [
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ];
  }

  return [
    { title: `${loaderData.video.title} - Mediavault` },
    { name: 'description', content: `Watch ${loaderData.video.title} on Mediavault` },
  ];
}

export default function PlayerRoute({ loaderData }: Route.ComponentProps) {
  return <PlayerPage {...loaderData} />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <ProductRouteErrorView
          actions={[{ label: 'Go to library', to: '/' }]}
          activeRoute="videos"
          description={<p>The video might have been removed or the link could be incorrect.</p>}
          icon={<VideoOff className="size-6" aria-hidden />}
          title="We can’t find that video"
        />
      );
    }

    if (error.status === 400) {
      return (
        <ProductRouteErrorView
          actions={[{ label: 'Go to library', to: '/' }]}
          activeRoute="videos"
          description={
            <p>The link is missing some information. Check the address and try again.</p>
          }
          icon={<ShieldAlert className="size-6" aria-hidden />}
          title="Invalid video request"
        />
      );
    }
  }

  return (
    <ProductRouteErrorView
      actions={[{ label: 'Go to library', to: '/' }]}
      activeRoute="videos"
      description={
        <p>
          {error instanceof Error
            ? error.message
            : 'Something unexpected happened while loading the video.'}
        </p>
      }
      icon={<AlertTriangle className="size-6" aria-hidden />}
      tone="critical"
      title="We couldn’t load the player"
    />
  );
}

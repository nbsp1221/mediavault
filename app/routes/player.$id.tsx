import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, ShieldAlert, VideoOff } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import { PlayerPage } from '~/pages/player/ui/PlayerPage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

interface SerializedVideo extends Omit<PlaybackCatalogVideo, 'createdAt'> {
  createdAt: string;
}

function serializeVideo(video: PlaybackCatalogVideo): SerializedVideo {
  return {
    ...video,
    createdAt: video.createdAt.toISOString(),
  };
}

function deserializeVideo(serialized: SerializedVideo): PlaybackCatalogVideo {
  return {
    ...serialized,
    createdAt: new Date(serialized.createdAt),
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
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

  return Response.json({
    relatedVideos: result.relatedVideos.map(serializeVideo),
    video: serializeVideo(result.video),
  }, {
    headers: publicRouteViewer.headers,
  });
}

export const meta: MetaFunction = ({ data }) => {
  const routeData = data as { video?: SerializedVideo } | undefined;
  if (!routeData?.video) {
    return [
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ];
  }

  return [
    { title: `${routeData.video.title} - Mediavault` },
    { name: 'description', content: `Watch ${routeData.video.title} on Mediavault` },
  ];
};

export default function PlayerRoute() {
  const data = useLoaderData() as {
    relatedVideos: SerializedVideo[];
    video: SerializedVideo;
  };
  const video = deserializeVideo(data.video);
  const relatedVideos = data.relatedVideos.map(deserializeVideo);

  return (
    <PlayerPage
      relatedVideos={relatedVideos}
      video={video}
    />
  );
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
          description={<p>The link is missing some information. Check the address and try again.</p>}
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
      description={<p>{error instanceof Error ? error.message : 'Something unexpected happened while loading the video.'}</p>}
      icon={<AlertTriangle className="size-6" aria-hidden />}
      tone="critical"
      title="We couldn’t load the player"
    />
  );
}

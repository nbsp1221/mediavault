import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, ShieldAlert, VideoOff } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { z } from 'zod';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import { loadPlaylistPlaybackQueue } from '~/composition/server/playlist';
import { createVideoReadAccessScope } from '~/modules/library/application/policies/video-read-access-scope';
import { PlayerPage } from '~/pages/player/ui/PlayerPage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

interface SerializedVideo extends Omit<PlaybackCatalogVideo, 'createdAt'> {
  createdAt: string;
}

const serializedVideoSchema = z.object({
  createdAt: z.string(),
  description: z.string().optional(),
  duration: z.number(),
  id: z.string(),
  tags: z.array(z.string()),
  thumbnailUrl: z.string().optional(),
  title: z.string(),
  videoUrl: z.string(),
});
const loaderDataSchema = z.object({
  video: serializedVideoSchema,
  relatedVideos: z.array(serializedVideoSchema),
  playlist: z
    .object({ id: z.string(), name: z.string(), videoIds: z.array(z.string()) })
    .nullable()
    .optional(),
});
const metaDataSchema = z.object({ video: z.object({ title: z.string() }) });

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

  const playlistId = new URL(request.url).searchParams.get('playlist');
  const queue = playlistId
    ? await loadPlaylistPlaybackQueue({ playlistId, viewer: publicRouteViewer.viewer })
    : null;
  const playlist = queue?.success && queue.data.videoIds.includes(videoId) ? queue.data : null;

  return Response.json(
    {
      playlist,
      relatedVideos: result.relatedVideos.map(serializeVideo),
      video: serializeVideo(result.video),
    },
    {
      headers: publicRouteViewer.headers,
    },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders, errorHeaders }) =>
  errorHeaders ?? loaderHeaders;

export const meta: MetaFunction = ({ loaderData }) => {
  const routeData = metaDataSchema.safeParse(loaderData);
  if (!routeData.success) {
    return [
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ];
  }

  return [
    { title: `${routeData.data.video.title} - Mediavault` },
    { name: 'description', content: `Watch ${routeData.data.video.title} on Mediavault` },
  ];
};

export default function PlayerRoute() {
  const data = loaderDataSchema.parse(useLoaderData<unknown>());
  const video = deserializeVideo(data.video);
  const relatedVideos = data.relatedVideos.map(deserializeVideo);

  return <PlayerPage playlist={data.playlist} relatedVideos={relatedVideos} video={video} />;
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

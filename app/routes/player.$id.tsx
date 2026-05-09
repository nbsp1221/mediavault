import type { ReactNode } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, ShieldAlert, VideoOff } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getServerPlaybackServices } from '~/composition/server/playback';
import { PlayerPage } from '~/pages/player/ui/PlayerPage';
import { Button } from '~/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card';

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
  await requireProtectedPageSession(request);

  const videoId = params.id;
  if (!videoId) {
    throw new Response('Video ID is required', { status: 400 });
  }

  const playbackServices = getServerPlaybackServices();
  const result = await playbackServices.resolvePlayerVideo.execute({
    videoId,
  });

  if (!result.ok) {
    throw new Response('Video not found', { status: 404 });
  }

  return {
    relatedVideos: result.relatedVideos.map(serializeVideo),
    video: serializeVideo(result.video),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [
      { title: 'Video Player - Mediavault' },
      { name: 'description', content: 'Local video streaming' },
    ];
  }

  return [
    { title: `${data.video.title} - Mediavault` },
    { name: 'description', content: `Watch ${data.video.title} on Mediavault` },
  ];
};

export default function PlayerRoute() {
  const data = useLoaderData<typeof loader>();
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
        <RouteStatusCard
          description="The video might have been removed or the link could be incorrect."
          icon={<VideoOff className="h-6 w-6" aria-hidden />}
          title="We can’t find that video"
        />
      );
    }

    if (error.status === 400) {
      return (
        <RouteStatusCard
          description="The link is missing some information. Check the address and try again."
          icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
          title="Invalid video request"
        />
      );
    }
  }

  return (
    <RouteStatusCard
      description={error instanceof Error ? error.message : 'Something unexpected happened while loading the video.'}
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="We couldn’t load the player"
    />
  );
}

function RouteStatusCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3">
          <Button asChild variant="default">
            <a href="/">Go to library</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/playlists">Browse playlists</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

import type { ReactNode } from 'react';
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle, VideoOff } from 'lucide-react';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { resolveRequestViewer } from '~/composition/server/auth';
import { toHomeLibraryVideoDto } from '~/composition/server/home-library-video-dto';
import { getServerLibraryServices } from '~/composition/server/library';
import { toVideoPolicyViewer } from '~/composition/server/video-access-viewer';
import { VideoDetailsPage } from '~/pages/video-details/ui/VideoDetailsPage';
import { getSafeRedirectTarget } from '~/shared/lib/http/redirects.server';
import { Button } from '~/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card';

interface LoaderData {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  redirectTo: string;
  video: SerializedHomeLibraryVideo;
}

interface SerializedHomeLibraryVideo extends Omit<HomeLibraryVideo, 'createdAt'> {
  createdAt: string;
}

function createPrivateHeaders() {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Cookie',
  });
}

function serializeHomeLibraryVideo(video: HomeLibraryVideo): SerializedHomeLibraryVideo {
  return {
    ...video,
    createdAt: video.createdAt.toISOString(),
  };
}

function deserializeHomeLibraryVideo(video: SerializedHomeLibraryVideo): HomeLibraryVideo {
  return {
    ...video,
    createdAt: new Date(video.createdAt),
  };
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const headers = createPrivateHeaders();
  const videoId = params.videoId;

  if (!videoId) {
    throw new Response('Video ID is required', {
      headers,
      status: 400,
    });
  }

  const requestViewer = await resolveRequestViewer(request);
  const viewer = toVideoPolicyViewer(requestViewer);
  const result = await getServerLibraryServices().loadOwnedVideoDetails.execute({
    viewer,
    videoId,
  });

  if (!result.ok) {
    if (result.reason === 'INVALID_INPUT') {
      throw new Response(result.message, {
        headers,
        status: 400,
      });
    }

    if (result.reason === 'VIDEO_DETAILS_SOURCE_UNAVAILABLE') {
      throw new Response('Unable to load video details', {
        headers,
        status: 500,
      });
    }

    throw new Response('Video not found', {
      headers,
      status: 404,
    });
  }

  return Response.json({
    contentTypes: result.data.contentTypes,
    genres: result.data.genres,
    redirectTo: getSafeRedirectTarget(request, '/'),
    video: serializeHomeLibraryVideo(toHomeLibraryVideoDto(result.data.video, viewer)),
  } satisfies LoaderData, {
    headers,
  });
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export const meta: MetaFunction = ({ data }) => {
  const routeData = data as LoaderData | undefined;

  return [
    { title: routeData?.video ? `${routeData.video.title} - Video details` : 'Video details' },
    { name: 'description', content: 'Manage video details' },
  ];
};

export default function VideoDetailsRoute() {
  const data = useLoaderData() as LoaderData;

  return (
    <VideoDetailsPage
      contentTypes={data.contentTypes}
      genres={data.genres}
      redirectTo={data.redirectTo}
      video={deserializeHomeLibraryVideo(data.video)}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <RouteStatusCard
        description="The video might have been removed or the link could be incorrect."
        icon={<VideoOff className="h-6 w-6" aria-hidden />}
        title="We can’t find that video"
      />
    );
  }

  return (
    <RouteStatusCard
      description={error instanceof Error ? error.message : 'Something unexpected happened while loading video details.'}
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="We couldn’t load video details"
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
        <CardContent className="flex justify-center">
          <Button asChild variant="default">
            <a href="/">Go to library</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

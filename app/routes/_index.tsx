import type { HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { isRouteErrorResponse, useLoaderData, useRouteError, useSearchParams } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { resolvePublicVideoAccess } from '~/composition/server/auth';
import { getHomeLibraryPageServices } from '~/composition/server/home-library-page';
import { videoTagsSchema } from '~/modules/library/domain/video-tag';
import { createHomeLibraryFilters } from '~/pages/home/model/home-library-filters';
import { HomePage } from '~/pages/home/ui/HomePage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

interface LoaderData {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  videos: SerializedHomeLibraryVideo[];
}

interface SerializedHomeLibraryVideo extends Omit<HomeLibraryVideo, 'createdAt'> {
  createdAt: string;
}

function serializeHomeLibraryVideo(video: {
  contentTypeSlug?: string;
  createdAt: Date;
  description?: string;
  duration: number;
  genreSlugs?: string[];
  id: string;
  isPrivate: boolean;
  permissions: HomeLibraryVideo['permissions'];
  tags: string[];
  thumbnailUrl?: string;
  title: string;
  videoUrl: string;
}): SerializedHomeLibraryVideo {
  return {
    contentTypeSlug: video.contentTypeSlug,
    createdAt: video.createdAt.toISOString(),
    description: video.description,
    duration: video.duration,
    genreSlugs: [...(video.genreSlugs ?? [])],
    id: video.id,
    isPrivate: video.isPrivate,
    permissions: { ...video.permissions },
    tags: [...video.tags],
    thumbnailUrl: video.thumbnailUrl,
    title: video.title,
    videoUrl: video.videoUrl,
  };
}

function deserializeHomeLibraryVideo(video: SerializedHomeLibraryVideo): HomeLibraryVideo {
  return {
    ...video,
    createdAt: new Date(video.createdAt),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const publicRouteViewer = await resolvePublicVideoAccess(request);
  const params = new URL(request.url).searchParams;
  for (const key of ['tag', 'notTag']) {
    const tags = videoTagsSchema.safeParse(params.getAll(key));
    if (!tags.success) {
      throw new Response(tags.error.issues[0]?.message ?? 'Invalid tag filters.', {
        status: 400,
        headers: publicRouteViewer.headers,
      });
    }
  }
  const result = await getHomeLibraryPageServices().loadHomeLibraryPageData.execute({
    viewer: publicRouteViewer.viewer,
  });

  if (!result.ok) {
    throw new Response('Unable to load home library', { status: 500 });
  }

  return Response.json(
    {
      contentTypes: result.data.contentTypes,
      genres: result.data.genres,
      videos: result.data.videos.map(serializeHomeLibraryVideo),
    } satisfies LoaderData,
    {
      headers: publicRouteViewer.headers,
    },
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

export function shouldRevalidate({
  currentUrl,
  defaultShouldRevalidate,
  nextUrl,
}: {
  currentUrl: URL;
  defaultShouldRevalidate: boolean;
  nextUrl: URL;
}) {
  if (
    currentUrl.pathname === '/' &&
    nextUrl.pathname === '/' &&
    currentUrl.search !== nextUrl.search
  ) {
    return false;
  }

  return defaultShouldRevalidate;
}

export function meta() {
  return [
    { title: 'Mediavault - Videos' },
    { name: 'description', content: 'Personal video library' },
  ];
}

export default function HomeRoute() {
  const data = useLoaderData<LoaderData>();
  const [searchParams] = useSearchParams();
  const videos = useMemo(() => data.videos.map(deserializeHomeLibraryVideo), [data.videos]);
  const initialFilters = useMemo(
    () =>
      createHomeLibraryFilters({
        query: searchParams.get('q') ?? '',
        contentTypeSlug: searchParams.get('type') ?? undefined,
        excludeTags: searchParams.getAll('notTag'),
        genreSlugs: searchParams.getAll('genre'),
        includeTags: searchParams.getAll('tag'),
      }),
    [searchParams],
  );

  return (
    <HomePage
      contentTypes={data.contentTypes}
      genres={data.genres}
      initialFilters={initialFilters}
      videos={videos}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const invalidFilterMessage: unknown =
    isRouteErrorResponse(error) && error.status === 400 ? error.data : null;

  return (
    <ProductRouteErrorView
      activeRoute="videos"
      contentWidth="wide"
      description={
        <p>
          {error instanceof Error
            ? error.message
            : typeof invalidFilterMessage === 'string'
              ? invalidFilterMessage
              : 'Unable to load home library.'}
        </p>
      }
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="Unable to load home library"
      tone="critical"
      actions={[{ label: 'Try again', to: '/' }]}
    />
  );
}

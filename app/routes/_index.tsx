import type { LoaderFunctionArgs } from 'react-router';
import { useMemo } from 'react';
import { useLoaderData, useSearchParams } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getHomeLibraryPageServices } from '~/composition/server/home-library-page';
import { toAuthenticatedVideoPolicyViewer } from '~/composition/server/video-access-viewer';
import { HomePage } from '~/pages/home/ui/HomePage';
import { createHomeLibraryFilters } from '~/widgets/home-library/model/home-library-filters';

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
  const authSession = await requireProtectedPageSession(request);
  const result = await getHomeLibraryPageServices().loadHomeLibraryPageData.execute({
    viewer: toAuthenticatedVideoPolicyViewer(authSession),
  });

  if (!result.ok) {
    throw new Response('Unable to load home library', { status: 500 });
  }

  return {
    contentTypes: result.data.contentTypes,
    genres: result.data.genres,
    videos: result.data.videos.map(serializeHomeLibraryVideo),
  } satisfies LoaderData;
}

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
    { title: 'Mediavault - My Library' },
    { name: 'description', content: 'Personal video library' },
  ];
}

export default function HomeRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const videos = useMemo(() => data.videos.map(deserializeHomeLibraryVideo), [data.videos]);
  const initialFilters = useMemo(() => createHomeLibraryFilters({
    query: searchParams.get('q') ?? '',
    contentTypeSlug: searchParams.get('type') ?? undefined,
    excludeTags: searchParams.getAll('notTag'),
    genreSlugs: searchParams.getAll('genre'),
    includeTags: searchParams.getAll('tag'),
  }), [searchParams]);

  return (
    <HomePage
      contentTypes={data.contentTypes}
      genres={data.genres}
      initialFilters={initialFilters}
      videos={videos}
    />
  );
}

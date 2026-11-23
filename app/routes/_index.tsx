import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { data, isRouteErrorResponse, useRouteError, useSearchParams } from 'react-router';
import { getHomeLibraryPageServices } from '~/composition/server/home-library-page.server';
import { videoTagsSchema } from '~/modules/library/domain/video-tag';
import { createHomeLibraryFilters } from '~/pages/home/model/home-library-filters';
import { HomePage } from '~/pages/home/ui/HomePage';
import { resolvePublicVideoAccess } from '~/routes/.server/auth-session-http';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';
import type { Route } from './+types/_index';

export async function loader({ request }: Route.LoaderArgs) {
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

  return data(result.data, { headers: publicRouteViewer.headers });
}

export const headers: Route.HeadersFunction = ({ loaderHeaders }) => loaderHeaders;

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

export default function HomeRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
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
      contentTypes={loaderData.contentTypes}
      genres={loaderData.genres}
      initialFilters={initialFilters}
      videos={loaderData.videos}
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

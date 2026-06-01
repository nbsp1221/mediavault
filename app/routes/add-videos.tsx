import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useLoaderData, useRouteError } from 'react-router';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { AddVideosPage } from '~/pages/add-videos/ui/AddVideosPage';
import { ProductRouteErrorView } from '~/widgets/product-shell/ui/ProductRouteErrorView';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireProtectedPageSession(request);
  const result = await getServerLibraryServices().loadVideoMetadataVocabulary.execute();

  if (!result.ok) {
    throw new Response('Unable to load video metadata vocabulary', { status: 500 });
  }

  return result.data;
}

export const meta: MetaFunction = () => ([
  { title: 'Add Videos - Mediavault' },
  { name: 'description', content: 'Add new videos to your library' },
]);

export default function AddVideosRoute() {
  const data = useLoaderData<typeof loader>();

  return <AddVideosPage contentTypes={data.contentTypes} genres={data.genres} />;
}

export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <ProductRouteErrorView
      activeRoute="upload"
      contentWidth="standard"
      description={<p>{error instanceof Error ? error.message : 'Unable to load upload metadata.'}</p>}
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title="Unable to load upload"
      tone="critical"
      actions={[
        { label: 'Go to library', to: '/' },
      ]}
    />
  );
}

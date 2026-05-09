import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { requireProtectedPageSession } from '~/composition/server/auth';
import { getServerLibraryServices } from '~/composition/server/library';
import { AddVideosPage } from '~/pages/add-videos/ui/AddVideosPage';

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

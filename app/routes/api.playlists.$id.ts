import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  requireProtectedApiSessionValue,
  resolvePublicVideoAccess,
} from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

const pageSchema = z
  .object({
    includeVideos: z.enum(['true', 'false']).default('true'),
    includeRelated: z.enum(['true', 'false']).default('true'),
    videoLimit: z.coerce.number().int().min(1).max(100).default(50),
    videoOffset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    isPublic: z.boolean().optional(),
    metadata: z
      .object({
        seriesName: z.string().max(255).optional(),
        seasonNumber: z.number().int().positive().optional(),
        episodeCount: z.number().int().nonnegative().optional(),
        genre: z.array(z.string().max(100)).max(30).optional(),
        year: z.number().int().min(1800).max(3000).optional(),
        status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
        parentPlaylistId: z.string().max(255).optional(),
        originalLanguage: z.string().max(100).optional(),
        studio: z.string().max(255).optional(),
        rating: z.string().max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await resolvePublicVideoAccess(request);
  if (!params.id) {
    return Response.json(
      { success: false, error: 'Playlist ID is required' },
      { headers: access.headers, status: 400 },
    );
  }
  const page = pageSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!page.success) {
    return Response.json(
      { success: false, error: 'Invalid playlist pagination' },
      { headers: access.headers, status: 400 },
    );
  }
  const result = await getServerPlaylistServices().getPlaylistDetails.execute({
    includeRelated: page.data.includeRelated === 'true',
    includeVideos: page.data.includeVideos === 'true',
    ownerId: access.viewer.type === 'authenticated' ? access.viewer.userId : undefined,
    playlistId: params.id,
    videoLimit: page.data.videoLimit,
    videoOffset: page.data.videoOffset,
  });
  return result.success
    ? Response.json({ success: true, ...result.data }, { headers: access.headers })
    : Response.json(
        { success: false, error: result.error },
        { headers: access.headers, status: result.status },
      );
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'PUT' && request.method !== 'DELETE') {
    return Response.json(
      { success: false, error: `Method ${request.method} not allowed` },
      { status: 405, headers: { Allow: 'GET, PUT, DELETE' } },
    );
  }
  const session = await requireProtectedApiSessionValue(request);
  if (session instanceof Response) {
    return session;
  }
  if (!params.id) {
    return Response.json({ success: false, error: 'Playlist ID is required' }, { status: 400 });
  }
  const services = getServerPlaylistServices();
  if (request.method === 'DELETE') {
    const result = await services.deletePlaylist.execute({
      ownerId: session.userId,
      playlistId: params.id,
    });
    return result.success
      ? Response.json({ ...result.data, success: true })
      : Response.json({ success: false, error: result.error }, { status: result.status });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ success: false, error: 'Invalid playlist details' }, { status: 400 });
  }
  const result = await services.updatePlaylist.execute({
    ...parsed.data,
    ownerId: session.userId,
    playlistId: params.id,
  });
  return result.success
    ? Response.json({ ...result.data, success: true })
    : Response.json({ success: false, error: result.error }, { status: result.status });
}

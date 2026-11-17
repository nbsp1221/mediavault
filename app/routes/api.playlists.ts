import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  requireProtectedApiSessionValue,
  resolvePublicVideoAccess,
} from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

const querySchema = z
  .object({
    q: z.string().max(255).optional(),
    owner: z.enum(['me']).optional(),
    type: z.enum(['user_created', 'series', 'season', 'auto_generated']).optional(),
    genre: z.array(z.string().max(100)).max(30).default([]),
    isPublic: z.enum(['true', 'false']).optional(),
    seriesName: z.string().max(255).optional(),
    status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
    includeEmpty: z.enum(['true', 'false']).default('true'),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'videoCount']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
const createSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(1000).optional(),
    isPublic: z.boolean().optional(),
    type: z.enum(['user_created', 'series', 'season']).default('user_created'),
    metadata: z
      .object({
        seriesName: z.string().trim().min(1).max(255).optional(),
        seasonNumber: z.number().int().positive().optional(),
        genre: z.array(z.string().max(100)).max(30).optional(),
        year: z.number().int().min(1800).max(3000).optional(),
        status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
      })
      .optional(),
    initialVideoIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await resolvePublicVideoAccess(request);
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({
    ...Object.fromEntries(params),
    genre: params.getAll('genre'),
  });
  if (!query.success) {
    return Response.json(
      { success: false, error: 'Invalid playlist query' },
      { headers: access.headers, status: 400 },
    );
  }
  const ownerId = access.viewer.type === 'authenticated' ? access.viewer.userId : undefined;
  if (query.data.owner === 'me' && !ownerId) {
    return Response.json(
      { success: false, error: 'Authentication required' },
      { headers: access.headers, status: 401 },
    );
  }
  const result = await getServerPlaylistServices().findPlaylists.execute({
    filters: {
      searchQuery: query.data.q || undefined,
      ownerId: query.data.owner === 'me' ? ownerId : undefined,
      type: query.data.type,
      genre: query.data.genre,
      isPublic: query.data.isPublic === undefined ? undefined : query.data.isPublic === 'true',
      seriesName: query.data.seriesName,
      status: query.data.status,
    },
    includeEmpty: query.data.includeEmpty === 'true',
    limit: query.data.limit,
    offset: query.data.offset,
    ownerId,
    sortBy: query.data.sortBy,
    sortOrder: query.data.sortOrder,
  });
  return result.success
    ? Response.json({ success: true, ...result.data }, { headers: access.headers })
    : Response.json(
        { success: false, error: result.error },
        { headers: access.headers, status: result.status },
      );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: { Allow: 'GET, POST' } },
    );
  }
  const session = await requireProtectedApiSessionValue(request);
  if (session instanceof Response) {
    return session;
  }
  const body: unknown = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, error: 'Invalid playlist details' }, { status: 400 });
  }
  const result = await getServerPlaylistServices().createPlaylist.execute({
    ...parsed.data,
    ownerId: session.userId,
  });
  return result.success
    ? Response.json({ success: true, ...result.data }, { status: 201 })
    : Response.json({ success: false, error: result.error }, { status: result.status });
}

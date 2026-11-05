import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

const addSchema = z
  .object({
    videoId: z.string().min(1).max(255),
    position: z.number().int().nonnegative().optional(),
    episodeMetadata: z
      .object({
        episodeNumber: z.number().int().positive().optional(),
        episodeTitle: z.string().max(255).optional(),
        watchProgress: z.number().min(0).max(100).optional(),
        duration: z.number().nonnegative().optional(),
        notes: z.string().max(1000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const reorderSchema = z
  .object({ newOrder: z.array(z.string().min(1).max(255)).min(1).max(10000) })
  .strict();

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return Response.json(
      { success: false, error: `Method ${request.method} not allowed` },
      { status: 405, headers: { Allow: 'POST, PUT' } },
    );
  }
  const session = await requireProtectedApiSessionValue(request);
  if (session instanceof Response) {
    return session;
  }
  if (!params.id) {
    return Response.json({ success: false, error: 'Playlist ID is required' }, { status: 400 });
  }
  const body: unknown = await request.json().catch(() => null);
  const services = getServerPlaylistServices();
  if (request.method === 'POST') {
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ success: false, error: 'Invalid playlist item' }, { status: 400 });
    }
    const result = await services.addVideoToPlaylist.execute({
      ...parsed.data,
      ownerId: session.userId,
      playlistId: params.id,
    });
    return result.success
      ? Response.json({ ...result.data, success: true })
      : Response.json({ success: false, error: result.error }, { status: result.status });
  }
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, error: 'Invalid playlist order' }, { status: 400 });
  }
  const result = await services.reorderPlaylistItems.execute({
    ...parsed.data,
    ownerId: session.userId,
    playlistId: params.id,
  });
  return result.success
    ? Response.json({ ...result.data, success: true })
    : Response.json({ success: false, error: result.error }, { status: result.status });
}

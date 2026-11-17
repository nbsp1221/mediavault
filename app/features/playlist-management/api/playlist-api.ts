import { z } from 'zod';
import type { Playlist, PlaylistWithVideos } from '~/entities/playlist/model/playlist';

const playlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  ownerId: z.string(),
  type: z.enum(['user_created', 'series', 'season', 'auto_generated']),
  isPublic: z.boolean(),
  videoIds: z.array(z.string()),
  thumbnailUrl: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z
    .object({
      seriesName: z.string().optional(),
      seasonNumber: z.number().optional(),
      episodeCount: z.number().optional(),
      genre: z.array(z.string()).optional(),
      year: z.number().optional(),
      status: z.enum(['ongoing', 'completed', 'hiatus']).optional(),
      parentPlaylistId: z.string().optional(),
      originalLanguage: z.string().optional(),
      studio: z.string().optional(),
      rating: z.string().optional(),
    })
    .optional(),
}) satisfies z.ZodType<Playlist>;
const episodeSchema = z.object({
  episodeNumber: z.number().optional(),
  episodeTitle: z.string().optional(),
  watchProgress: z.number().optional(),
  duration: z.number().optional(),
  notes: z.string().optional(),
});
const videoSchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  position: z.number(),
  thumbnailUrl: z.string().optional(),
  episodeMetadata: episodeSchema.optional(),
});
const responseSchema = z
  .object({ success: z.boolean(), error: z.string().optional() })
  .passthrough();

export const playlistPageSchema = z.object({
  playlists: z.array(playlistSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
});
export const playlistDetailsSchema = z.object({
  playlist: playlistSchema.extend({
    videos: z.array(videoSchema),
  }) satisfies z.ZodType<PlaylistWithVideos>,
  permissions: z.object({
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    canAddVideos: z.boolean(),
  }),
  videoPagination: z
    .object({ total: z.number(), limit: z.number(), offset: z.number(), hasMore: z.boolean() })
    .nullable(),
  relatedPlaylists: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        videoCount: z.number(),
        relationship: z.string(),
      }),
    )
    .optional(),
});

export type PlaylistPage = z.infer<typeof playlistPageSchema>;
export type PlaylistDetails = z.infer<typeof playlistDetailsSchema>;

export interface PlaylistEditorValues {
  name: string;
  description: string;
  isPublic: boolean;
}

type ResponseEnvelope = z.infer<typeof responseSchema>;

export function playlistRequest(url: string, init?: RequestInit): Promise<ResponseEnvelope>;
export function playlistRequest<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T>;

/** Validate the transport envelope and consumed endpoint data before exposing it to UI state. */
export async function playlistRequest(
  url: string,
  init: RequestInit = {},
  schema?: z.ZodType,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers });
  const body: unknown = await response.json();
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('The server returned an invalid playlist response.');
  }
  if (!response.ok || !parsed.data.success) {
    throw new Error(parsed.data.error || 'The playlist request failed. Please try again.');
  }
  if (!schema) {
    return parsed.data;
  }
  const data = schema.safeParse(body);
  if (!data.success) {
    throw new Error('The server returned incomplete playlist data.');
  }
  return data.data;
}

export function listOwnedPlaylists(offset = 0, signal?: AbortSignal): Promise<PlaylistPage> {
  return playlistRequest(
    `/api/playlists?owner=me&limit=100&offset=${offset}`,
    { signal },
    playlistPageSchema,
  );
}

export function addVideoToPlaylist(playlistId: string, videoId: string): Promise<ResponseEnvelope> {
  return playlistRequest(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
    method: 'POST',
    body: JSON.stringify({ videoId }),
  });
}

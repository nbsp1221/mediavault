import { z } from 'zod';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';

interface UpdateVideoPayload {
  contentTypeSlug?: string | null;
  title: string;
  tags: string[];
  genreSlugs: string[];
  description?: string;
}

const videoSchema = z.object({
  id: z.string(),
  title: z.string(),
  isPrivate: z.boolean(),
  permissions: z.object({
    canDelete: z.boolean(),
    canEdit: z.boolean(),
    canManageVisibility: z.boolean(),
  }),
  tags: z.array(z.string()),
  genreSlugs: z.array(z.string()).optional(),
  contentTypeSlug: z.string().optional(),
  description: z.string().optional(),
  duration: z.number(),
  thumbnailUrl: z.string().optional(),
  videoUrl: z.string(),
  createdAt: z.coerce.date(),
}) satisfies z.ZodType<HomeLibraryVideo>;
const responseSchema = z.object({
  error: z.string().optional(),
  success: z.boolean(),
  video: videoSchema.optional(),
});

type VideoActionResult = z.infer<typeof responseSchema>;

export interface LibraryVideoActions {
  changeVisibility(video: HomeLibraryVideo, visibility: VideoVisibility): Promise<HomeLibraryVideo>;
  deleteVideo(video: HomeLibraryVideo): Promise<void>;
  updateVideo(video: HomeLibraryVideo, updates: UpdateVideoPayload): Promise<HomeLibraryVideo>;
}

async function readActionError(response: Response, fallbackMessage: string) {
  try {
    const body: unknown = await response.json();
    const result = z.object({ error: z.string().optional() }).safeParse(body);
    return result.success ? result.data.error || fallbackMessage : fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

async function assertSuccessfulAction(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    throw new Error(await readActionError(response, fallbackMessage));
  }

  const body: unknown = await response.json();
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(fallbackMessage);
  }
  if (!parsed.data.success) {
    throw new Error(parsed.data.error || fallbackMessage);
  }
  return parsed.data;
}

async function executeVideoAction(url: string, init: RequestInit, fallbackMessage: string) {
  const response = await fetch(url, init);
  return assertSuccessfulAction(response, fallbackMessage);
}

function deserializeUpdatedVideo(
  result: VideoActionResult,
  fallbackMessage: string,
): HomeLibraryVideo {
  if (!result.video) {
    throw new Error(fallbackMessage);
  }

  return result.video;
}

export const libraryVideoActions: LibraryVideoActions = {
  changeVisibility: changeLibraryVideoVisibility,
  deleteVideo: deleteLibraryVideo,
  updateVideo: updateLibraryVideoMetadata,
};

export async function changeLibraryVideoVisibility(
  video: HomeLibraryVideo,
  visibility: VideoVisibility,
): Promise<HomeLibraryVideo> {
  if (!video.permissions.canManageVisibility) {
    throw new Error('Video visibility cannot be changed by this viewer');
  }

  const result = await executeVideoAction(
    `/api/visibility/${video.id}`,
    {
      body: JSON.stringify({ visibility }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    },
    'Visibility could not be updated. Try again.',
  );

  return deserializeUpdatedVideo(result, 'Updated video response was incomplete');
}

export async function deleteLibraryVideo(video: HomeLibraryVideo): Promise<void> {
  if (!video.permissions.canDelete) {
    throw new Error('Video cannot be deleted by this viewer');
  }

  await executeVideoAction(
    `/api/delete/${video.id}`,
    {
      method: 'DELETE',
    },
    'Failed to delete video',
  );
}

export async function updateLibraryVideoMetadata(
  video: HomeLibraryVideo,
  updates: UpdateVideoPayload,
): Promise<HomeLibraryVideo> {
  if (!video.permissions.canEdit) {
    throw new Error('Video cannot be edited by this viewer');
  }

  const result = await executeVideoAction(
    `/api/update/${video.id}`,
    {
      body: JSON.stringify(updates),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    },
    'Failed to update video',
  );

  return deserializeUpdatedVideo(result, 'Updated video response was incomplete');
}

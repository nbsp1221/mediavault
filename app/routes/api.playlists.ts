import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { requireProtectedApiSessionValue } from '~/composition/server/auth';
import { getServerPlaylistServices } from '~/composition/server/playlist';

const playlistTypes = ['user_created', 'series', 'season', 'auto_generated'] as const;
const playlistStatuses = ['ongoing', 'completed', 'hiatus'] as const;
const playlistSortFields = ['name', 'createdAt', 'updatedAt', 'videoCount', 'popularity'] as const;
const sortOrders = ['asc', 'desc'] as const;

type PlaylistType = typeof playlistTypes[number];
type PlaylistStatus = typeof playlistStatuses[number];
type PlaylistSortField = typeof playlistSortFields[number];
type PlaylistSortOrder = typeof sortOrders[number];

type UseCaseResult<T> =
  | { data: T; success: true }
  | { error: string; reason: string; status: number; success: false };

function getErrorStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status;
    }
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') {
      return statusCode;
    }
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const message = (error as { error?: unknown }).error;
    if (typeof message === 'string') {
      return message;
    }
  }

  return error instanceof Error ? error.message : 'Unknown error occurred';
}

function createErrorResponse(error: unknown): Response {
  return Response.json({
    success: false,
    error: getErrorMessage(error),
  }, { status: getErrorStatusCode(error) });
}

function handleUseCaseResult<T>(result: UseCaseResult<T>): Response | T {
  if (result.success) {
    return result.data;
  }

  return createErrorResponse(result);
}

function parsePlaylistType(value: string | null): PlaylistType | undefined {
  if (value === null) {
    return undefined;
  }

  return playlistTypes.includes(value as PlaylistType)
    ? value as PlaylistType
    : undefined;
}

function parsePlaylistStatus(value: string | null): PlaylistStatus | undefined {
  if (value === null) {
    return undefined;
  }

  return playlistStatuses.includes(value as PlaylistStatus)
    ? value as PlaylistStatus
    : undefined;
}

function parseSortBy(value: string | null): PlaylistSortField {
  if (value === null) {
    return 'updatedAt';
  }

  return playlistSortFields.includes(value as PlaylistSortField)
    ? value as PlaylistSortField
    : 'updatedAt';
}

function parseSortOrder(value: string | null): PlaylistSortOrder {
  if (value === null) {
    return 'desc';
  }

  return sortOrders.includes(value as PlaylistSortOrder)
    ? value as PlaylistSortOrder
    : 'desc';
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const authSession = await requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const ownerId = authSession.userId;
    const url = new URL(request.url);
    const services = getServerPlaylistServices();

    const result = await services.findPlaylists.execute({
      filters: {
        type: parsePlaylistType(url.searchParams.get('type')),
        searchQuery: url.searchParams.get('q') || undefined,
        genre: url.searchParams.getAll('genre'),
        isPublic: url.searchParams.get('isPublic') === 'true'
          ? true
          : url.searchParams.get('isPublic') === 'false' ? false : undefined,
        seriesName: url.searchParams.get('seriesName') || undefined,
        status: parsePlaylistStatus(url.searchParams.get('status')),
      },
      includeEmpty: url.searchParams.get('includeEmpty') !== 'false',
      includeStats: url.searchParams.get('includeStats') === 'true',
      limit: parseInt(url.searchParams.get('limit') || '20'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
      sortBy: parseSortBy(url.searchParams.get('sortBy')),
      sortOrder: parseSortOrder(url.searchParams.get('sortOrder')),
      ownerId,
    });

    const response = handleUseCaseResult(result);
    if (response instanceof Response) {
      return response;
    }

    return Response.json({
      success: true,
      ...response,
    });
  }
  catch (error) {
    console.error('Unexpected error in find playlists route:', error);
    return createErrorResponse(error);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405 },
    );
  }

  try {
    const authSession = await requireProtectedApiSessionValue(request);
    if (authSession instanceof Response) return authSession;

    const ownerId = authSession.userId;
    const services = getServerPlaylistServices();
    const body = await request.json() as {
      description?: string;
      initialVideoIds?: string[];
      isPublic?: boolean;
      metadata?: Record<string, unknown>;
      name?: string;
      type?: PlaylistType;
    };

    const result = await services.createPlaylist.execute({
      description: body.description,
      initialVideoIds: body.initialVideoIds,
      isPublic: body.isPublic,
      metadata: body.metadata,
      name: body.name ?? '',
      type: body.type ?? 'user_created',
      ownerId,
    });

    const response = handleUseCaseResult(result);
    if (response instanceof Response) {
      return response;
    }

    return Response.json({
      success: true,
      ...response,
    });
  }
  catch (error) {
    console.error('Unexpected error in create playlist route:', error);
    return createErrorResponse(error);
  }
}

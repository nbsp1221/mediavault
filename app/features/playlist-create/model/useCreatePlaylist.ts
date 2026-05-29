import { useCallback, useEffect, useReducer } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import type { CreatePlaylistRequest } from '~/entities/playlist/model/playlist';

interface CreatePlaylistFetcherData {
  error?: string;
  success?: boolean;
}

interface UseCreatePlaylistReturn {
  createPlaylist: (data: CreatePlaylistRequest) => void;
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
  reset: () => void;
}

export function useCreatePlaylist(): UseCreatePlaylistReturn {
  const [fetcherVersion, resetFetcherVersion] = useReducer(version => version + 1, 0);
  const fetcher = useFetcher<CreatePlaylistFetcherData>({ key: `playlist-create-${fetcherVersion}` });
  const revalidator = useRevalidator();
  const fetcherSucceeded = fetcher.state === 'idle' && Boolean(fetcher.data?.success);

  const createPlaylist = useCallback((data: CreatePlaylistRequest) => {
    const payload: Record<string, unknown> = {
      name: data.name,
      type: data.type,
    };

    if (data.description !== undefined) {
      payload.description = data.description;
    }

    if (data.initialVideoIds !== undefined) {
      payload.initialVideoIds = [...data.initialVideoIds];
    }

    if (data.isPublic !== undefined) {
      payload.isPublic = data.isPublic;
    }

    if (data.metadata !== undefined) {
      payload.metadata = JSON.parse(JSON.stringify(data.metadata)) as Record<string, unknown>;
    }

    fetcher.submit(
      payload as Parameters<typeof fetcher.submit>[0],
      {
        method: 'POST',
        action: '/api/playlists',
        encType: 'application/json',
      },
    );
  }, [fetcher]);

  useEffect(() => {
    if (fetcherSucceeded) {
      revalidator.revalidate();
    }
  }, [fetcherSucceeded, revalidator]);

  const reset = useCallback(() => {
    const shouldRevalidate = fetcher.state === 'idle' && Boolean(fetcher.data?.success || fetcher.data?.error);

    resetFetcherVersion();

    if (shouldRevalidate) {
      revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  return {
    createPlaylist,
    isSubmitting: fetcher.state !== 'idle',
    isSuccess: fetcherSucceeded,
    error: fetcher.data?.error ?? null,
    reset,
  };
}

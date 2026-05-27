import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const fetcherLoadMock = vi.fn();
const fetcherSubmitMock = vi.fn();
const revalidateMock = vi.fn();
let fetcherData: { error?: string; success?: boolean } | undefined;
let fetcherKey: string | undefined;
let fetcherState = 'idle';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useFetcher: (options?: { key?: string }) => {
      fetcherKey = options?.key;

      return {
        data: fetcherData,
        load: fetcherLoadMock,
        state: fetcherState,
        submit: fetcherSubmitMock,
      };
    },
    useRevalidator: () => ({
      revalidate: revalidateMock,
      state: 'idle',
    }),
  };
});

describe('useCreatePlaylist', () => {
  beforeEach(() => {
    fetcherData = undefined;
    fetcherKey = undefined;
    fetcherLoadMock.mockReset();
    fetcherSubmitMock.mockReset();
    fetcherState = 'idle';
    revalidateMock.mockReset();
  });

  test('submits a plain object payload to the playlist action', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    const { result } = renderHook(() => useCreatePlaylist());

    act(() => {
      result.current.createPlaylist({
        description: 'Fixture playlist',
        isPublic: false,
        name: 'Vault',
        type: 'user_created',
      });
    });

    expect(fetcherSubmitMock).toHaveBeenCalledWith({
      description: 'Fixture playlist',
      isPublic: false,
      name: 'Vault',
      type: 'user_created',
    }, {
      action: '/api/playlists',
      encType: 'application/json',
      method: 'POST',
    });
  });

  test('submits optional playlist fields without sharing mutable caller data', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    const { result } = renderHook(() => useCreatePlaylist());
    const metadata = { genre: ['drama'], rating: 'PG' };
    const initialVideoIds = ['video-a', 'video-b'];

    act(() => {
      result.current.createPlaylist({
        initialVideoIds,
        metadata,
        name: 'Vault',
        type: 'user_created',
      });
    });

    metadata.genre.push('noir');
    initialVideoIds.push('video-c');

    expect(fetcherSubmitMock).toHaveBeenCalledWith({
      initialVideoIds: ['video-a', 'video-b'],
      metadata: { genre: ['drama'], rating: 'PG' },
      name: 'Vault',
      type: 'user_created',
    }, {
      action: '/api/playlists',
      encType: 'application/json',
      method: 'POST',
    });
  });

  test('revalidates the current route when creation succeeds', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    const { result, rerender } = renderHook(() => useCreatePlaylist());

    fetcherData = { success: true };
    fetcherState = 'idle';
    rerender();

    expect(revalidateMock).toHaveBeenCalled();
    expect(fetcherLoadMock).not.toHaveBeenCalled();
    expect(result.current.isSuccess).toBe(true);
  });

  test('exposes pending and error fetcher state without reporting success', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    fetcherState = 'submitting';
    fetcherData = { error: 'Name is required.' };

    const { result } = renderHook(() => useCreatePlaylist());

    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBe('Name is required.');
  });

  test('clears the success state on reset after a successful creation', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    const { result, rerender } = renderHook(() => useCreatePlaylist());

    fetcherData = { success: true };
    fetcherState = 'idle';
    rerender();

    expect(result.current.isSuccess).toBe(true);
    expect(fetcherKey).toBe('playlist-create-0');

    act(() => {
      result.current.reset();
    });

    fetcherData = undefined;
    rerender();

    expect(fetcherKey).toBe('playlist-create-1');
    expect(result.current.isSuccess).toBe(false);
  });

  test('reset revalidates settled errors but not active submissions', async () => {
    const { useCreatePlaylist } = await import('../../../app/features/playlist-create/model/useCreatePlaylist');
    fetcherData = { error: 'Duplicate playlist.' };
    const { result, rerender } = renderHook(() => useCreatePlaylist());

    act(() => {
      result.current.reset();
    });

    expect(revalidateMock).toHaveBeenCalledTimes(1);

    revalidateMock.mockReset();
    fetcherState = 'submitting';
    rerender();

    act(() => {
      result.current.reset();
    });

    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

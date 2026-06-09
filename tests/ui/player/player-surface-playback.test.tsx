import { screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import {
  createPlayerSurfaceElement,
  createVideo,
  protectedPlaybackSessionState,
  providerHarness,
  renderPlayerSurface,
} from './player-surface-test-harness';

describe('PlayerSurface playback contracts', () => {
  test('renders playback errors without mounting the media provider', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: 'Could not prepare the playback token.',
      isLoading: false,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface();

    expect(screen.getByText('Playback error')).toBeInTheDocument();
    expect(screen.getByText('Could not prepare the playback token.')).toBeInTheDocument();
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });

  test('keeps the player context tree mounted while protected playback is still bootstrapping', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: true,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface({
      video: createVideo({ videoUrl: '/videos/video-1/manifest.mpd' }),
    });

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('media-provider')).toBeInTheDocument();
    expect(screen.getByTestId('default-video-layout')).toBeInTheDocument();
    expect(screen.getByText('Preparing secure playback')).toBeInTheDocument();
  });

  test('shows the loading shell when playback is not loading but has no manifest yet', () => {
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: null,
      token: null,
    };

    renderPlayerSurface();

    expect(screen.getByTestId('media-player')).toHaveAttribute('data-player-src', '');
    expect(screen.getByText('Preparing secure playback')).toBeInTheDocument();
  });

  test('wires DASH providers with the current DRM configuration and token', async () => {
    const onInstance = vi.fn(async (callback: (provider: unknown) => Promise<void>) => {
      await callback({ id: 'dash-provider' });
    });
    const dashProvider = {
      isDash: true,
      onInstance,
    };
    protectedPlaybackSessionState.current = {
      drmConfig: {
        key: 'clear-key',
        keyId: 'clear-key-id',
      },
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: 'token-1',
    };

    renderPlayerSurface();

    await providerHarness.onProviderChange?.(dashProvider);

    expect(screen.queryByText('Preparing secure playback')).not.toBeInTheDocument();
    expect(onInstance).toHaveBeenCalled();
    expect(providerHarness.configureDashPlaybackProvider).toHaveBeenCalledWith({
      drmConfig: {
        key: 'clear-key',
        keyId: 'clear-key-id',
      },
      provider: { id: 'dash-provider' },
      token: 'token-1',
    });
  });

  test('remounts the media player when playback authorization identity changes', () => {
    providerHarness.mediaPlayerMounts = 0;
    providerHarness.mediaPlayerUnmounts = 0;
    protectedPlaybackSessionState.current = {
      drmConfig: null,
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: null,
    };

    const { rerender } = renderPlayerSurface({
      video: createVideo({ id: 'video-1' }),
    });

    expect(providerHarness.mediaPlayerMounts).toBe(1);
    expect(providerHarness.mediaPlayerUnmounts).toBe(0);

    protectedPlaybackSessionState.current = {
      drmConfig: {
        key: 'next-clear-key',
        keyId: 'next-clear-key-id',
      },
      error: null,
      isLoading: false,
      manifestUrl: 'https://cdn.example.com/video-1.mpd',
      token: 'token-2',
    };

    rerender(createPlayerSurfaceElement({
      video: createVideo({ id: 'video-1' }),
    }));

    expect(providerHarness.mediaPlayerMounts).toBe(2);
    expect(providerHarness.mediaPlayerUnmounts).toBe(1);
  });
});

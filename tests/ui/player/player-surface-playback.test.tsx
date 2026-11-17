import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  createPlayerSurfaceElement,
  createVideo,
  playbackHarness,
  protectedPlaybackSessionState,
  renderPlayerSurface,
} from './player-surface-test-harness';

const ready = {
  error: null,
  isLoading: false,
  licenseUrl: '/videos/video-1/clearkey',
  manifestUrl: '/videos/video-1/manifest.mpd',
  token: 'test-token-1',
};

describe('PlayerSurface playback', () => {
  test('renders bootstrap failures without mounting a playback engine', () => {
    protectedPlaybackSessionState.current = {
      error: 'This video is no longer available.',
      isLoading: false,
      licenseUrl: null,
      manifestUrl: null,
      token: null,
    };
    renderPlayerSurface();
    expect(screen.getByRole('alert')).toHaveTextContent('Playback error');
    expect(screen.getByRole('alert')).toHaveTextContent('This video is no longer available.');
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });
  test('uses an accessible stable placeholder before credentials are ready', () => {
    protectedPlaybackSessionState.current = {
      error: null,
      isLoading: true,
      licenseUrl: null,
      manifestUrl: null,
      token: null,
    };
    renderPlayerSurface();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing secure playback');
    expect(screen.queryByTestId('media-player')).not.toBeInTheDocument();
  });
  test('keeps the existing video mounted when only its credential changes', () => {
    playbackHarness.mounts = 0;
    playbackHarness.unmounts = 0;
    protectedPlaybackSessionState.current = ready;
    const { rerender } = renderPlayerSurface();
    const video = screen.getByLabelText('Primary fixture video');
    protectedPlaybackSessionState.current = { ...ready, token: 'test-token-2' };
    rerender(createPlayerSurfaceElement());
    expect(screen.getByLabelText('Primary fixture video')).toBe(video);
    expect(playbackHarness.mounts).toBe(1);
    expect(playbackHarness.unmounts).toBe(0);
    rerender(createPlayerSurfaceElement({ video: createVideo({ id: 'video-2' }) }));
    expect(playbackHarness.mounts).toBe(2);
    expect(playbackHarness.unmounts).toBe(1);
  });
  test('shows playlist context without replacing the related video tag filter', () => {
    protectedPlaybackSessionState.current = ready;
    renderPlayerSurface({
      playlist: { id: 'playlist-1', name: 'Public queue', videoIds: ['video-1', 'video-2'] },
    });
    expect(screen.getByRole('region', { name: 'Playlist queue' })).toHaveTextContent(
      'Video 1 of 2',
    );
    expect(screen.getByRole('link', { name: 'Public queue' })).toHaveAttribute(
      'href',
      '/playlists/playlist-1',
    );
    expect(screen.getByRole('button', { name: 'Next video' })).toBeEnabled();
    expect(screen.getByRole('complementary', { name: 'Related videos' })).toBeInTheDocument();
  });
  test('does not loop the final playlist item', () => {
    protectedPlaybackSessionState.current = ready;
    renderPlayerSurface({
      playlist: { id: 'playlist-1', name: 'Public queue', videoIds: ['video-1'] },
    });
    expect(screen.getByRole('button', { name: 'Next video' })).toBeDisabled();
  });
});

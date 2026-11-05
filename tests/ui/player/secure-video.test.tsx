import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createShakaPlayback } from '~/pages/player/lib/shaka-playback';
import { SecureVideo } from '~/pages/player/ui/SecureVideo';

const mediaAttach = vi.hoisted(() => vi.fn());
const lifecycle = vi.hoisted(() => ({ create: vi.fn<typeof createShakaPlayback>(), destroys: 0 }));
vi.mock('@videojs/react', () => ({ useMediaAttach: () => mediaAttach }));
vi.mock('@videojs/react/video', () => ({
  VideoPlayer: ({ children }: { children: ReactNode }) => children,
  VideoSkin: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/pages/player/lib/shaka-playback', () => ({ createShakaPlayback: lifecycle.create }));

const props = {
  licenseUrl: '/videos/video-1/clearkey',
  manifestUrl: '/videos/video-1/manifest.mpd',
  title: 'Encrypted fixture',
  token: 'test-token-1',
  videoId: 'video-1',
};
beforeEach(() => {
  lifecycle.create.mockReset();
  mediaAttach.mockReset();
  lifecycle.destroys = 0;
  lifecycle.create.mockImplementation((input: Parameters<typeof createShakaPlayback>[0]) => ({
    start: vi.fn(() => {
      input.onReady();
      return Promise.resolve();
    }),
    destroy: vi.fn(() => {
      lifecycle.destroys++;
      return Promise.resolve();
    }),
  }));
});

describe('SecureVideo React ownership', () => {
  test('survives effect replay, keeps the same DOM and reads renewed credentials without restarting', () => {
    const { rerender, unmount } = render(
      <StrictMode>
        <SecureVideo {...props} />
      </StrictMode>,
    );
    expect(lifecycle.create).toHaveBeenCalledTimes(2);
    const video = screen.getByLabelText('Encrypted fixture');
    const activeInput = lifecycle.create.mock.calls[1]?.[0];
    expect(activeInput.readToken()).toBe('test-token-1');
    rerender(
      <StrictMode>
        <SecureVideo {...props} token="test-token-2" />
      </StrictMode>,
    );
    expect(screen.getByLabelText('Encrypted fixture')).toBe(video);
    expect(activeInput.readToken()).toBe('test-token-2');
    expect(lifecycle.create).toHaveBeenCalledTimes(2);
    expect(lifecycle.destroys).toBe(1);
    unmount();
    expect(lifecycle.destroys).toBe(2);
  });
  test('forwards the real ended event and playlist autoplay intent', () => {
    const onEnded = vi.fn();
    render(<SecureVideo {...props} autoPlay onEnded={onEnded} />);
    const video = screen.getByLabelText('Encrypted fixture');
    expect(video).toHaveAttribute('autoplay');
    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
  test('clears readiness when a previously loaded source fails', () => {
    render(<SecureVideo {...props} />);
    const viewport = screen.getByLabelText('Encrypted fixture').closest('[data-media-player]');
    expect(viewport).toHaveAttribute('data-can-play', 'true');
    const source = lifecycle.create.mock.calls[0][0];
    act(() => {
      source.onError('Could not play this video. Reload the page to try again.');
    });
    expect(viewport).not.toHaveAttribute('data-can-play');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  test('displays engine failure details only through the safe application message', () => {
    let input: Parameters<typeof createShakaPlayback>[0] | undefined;
    lifecycle.create.mockImplementation((value: Parameters<typeof createShakaPlayback>[0]) => {
      input = value;
      return { start: () => Promise.resolve(), destroy: () => Promise.resolve() };
    });
    render(<SecureVideo {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing secure playback');
    act(() => {
      input?.onError('Could not play this video. Reload the page to try again.');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Playback error');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

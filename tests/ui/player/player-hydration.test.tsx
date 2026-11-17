import { act, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  createPlayerSurfaceElement,
  protectedPlaybackSessionState,
} from './player-surface-test-harness';

test('hydrates the server placeholder before mounting browser playback without a mismatch', async () => {
  protectedPlaybackSessionState.current = {
    error: null,
    isLoading: false,
    licenseUrl: '/videos/video-1/clearkey',
    manifestUrl: '/videos/video-1/manifest.mpd',
    token: 'test-token',
  };
  const element = createPlayerSurfaceElement();
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  document.body.append(container);
  expect(container).toHaveTextContent('Preparing secure playback');
  expect(container.querySelector('video')).toBeNull();
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, { onRecoverableError });
    await Promise.resolve();
  });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Primary fixture video')).toBeInTheDocument();
  act(() => {
    root?.unmount();
  });
  container.remove();
});

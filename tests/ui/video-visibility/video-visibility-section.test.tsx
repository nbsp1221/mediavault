import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { VideoVisibilitySection } from '../../../app/features/video-visibility/ui/VideoVisibilitySection';

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    contentTypeSlug: 'movie',
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    description: 'A stored vault clip.',
    duration: 180,
    genreSlugs: ['action'],
    id: 'video-1',
    isPrivate: true,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['neo'],
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

describe('VideoVisibilitySection', () => {
  beforeAll(() => {
    class TestResizeObserver {
      disconnect() {
        return undefined;
      }

      observe() {
        return undefined;
      }

      unobserve() {
        return undefined;
      }
    }

    globalThis.ResizeObserver = TestResizeObserver;
  });

  test('does not render management controls without visibility permission', () => {
    const onChangeVisibility = vi.fn();

    const { container } = render(
      <VideoVisibilitySection
        onChangeVisibility={onChangeVisibility}
        video={createVideo({
          permissions: {
            canDelete: true,
            canEdit: true,
            canManageVisibility: false,
          },
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(onChangeVisibility).not.toHaveBeenCalled();
  });

  test('describes a private video and confirms before making it public', async () => {
    const user = userEvent.setup();
    const onChangeVisibility = vi.fn().mockResolvedValue(undefined);

    render(
      <VideoVisibilitySection
        onChangeVisibility={onChangeVisibility}
        video={createVideo({ isPrivate: true })}
      />,
    );

    expect(screen.getByRole('region', { name: 'Visibility' })).toHaveTextContent('Only you can browse and watch this video.');
    expect(screen.getByText('Current visibility: Private')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Make Public' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Make video public?' });
    expect(dialog).toHaveTextContent('Anyone who can access this site can find and watch this video.');

    await user.click(within(dialog).getByRole('button', { name: 'Make Public' }));

    expect(onChangeVisibility).toHaveBeenCalledWith('public');
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Public.');
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Make video public?' })).not.toBeInTheDocument());
  });

  test('makes a public video private without a confirmation dialog', async () => {
    const user = userEvent.setup();
    const onChangeVisibility = vi.fn().mockResolvedValue(undefined);

    render(
      <VideoVisibilitySection
        onChangeVisibility={onChangeVisibility}
        video={createVideo({ isPrivate: false })}
      />,
    );

    expect(screen.getByRole('region', { name: 'Visibility' })).toHaveTextContent('Anyone with site access can find and watch this video.');
    expect(screen.getByText('Current visibility: Public')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Make Private' }));

    expect(screen.queryByRole('alertdialog', { name: 'Make video public?' })).not.toBeInTheDocument();
    expect(onChangeVisibility).toHaveBeenCalledWith('private');
    expect(await screen.findByRole('status')).toHaveTextContent('Visibility updated to Private.');
  });

  test('keeps visibility failures section-local', async () => {
    const user = userEvent.setup();
    const onChangeVisibility = vi.fn().mockRejectedValue(new Error('visibility failed'));

    render(
      <VideoVisibilitySection
        onChangeVisibility={onChangeVisibility}
        video={createVideo({ isPrivate: false })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Make Private' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Visibility could not be updated. Try again.');
    expect(screen.getByText('Current visibility: Public')).toBeInTheDocument();
  });

  test('disables visibility actions and dialog dismissal while changing', async () => {
    const user = userEvent.setup();
    const onChangeVisibility = vi.fn();

    render(
      <VideoVisibilitySection
        isChanging
        onChangeVisibility={onChangeVisibility}
        video={createVideo({ isPrivate: true })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Updating...' }));

    expect(screen.queryByRole('alertdialog', { name: 'Make video public?' })).not.toBeInTheDocument();
    expect(onChangeVisibility).not.toHaveBeenCalled();
  });
});

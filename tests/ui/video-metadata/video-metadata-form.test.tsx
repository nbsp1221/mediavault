import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '../../../app/modules/library/domain/video-taxonomy';
import { VideoMetadataForm } from '../../../app/features/video-metadata/ui/VideoMetadataForm';

const contentTypes: VideoTaxonomyItem[] = [
  { active: true, label: 'Movie', slug: 'movie', sortOrder: 10 },
];

const genres: VideoTaxonomyItem[] = [
  { active: true, label: 'Action', slug: 'action', sortOrder: 10 },
];

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

describe('VideoMetadataForm', () => {
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
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  });

  test('submits through an external form action when inline actions are hidden', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <div>
        <button form="details-form" type="submit">Header save</button>
        <VideoMetadataForm
          contentTypes={contentTypes}
          formId="details-form"
          genres={genres}
          onCancel={onCancel}
          onSave={onSave}
          renderActions={false}
          video={createVideo()}
        />
      </div>,
    );

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Header Saved Fixture');
    await user.click(screen.getByRole('button', { name: 'Header save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      contentTypeSlug: 'movie',
      description: 'A stored vault clip.',
      genreSlugs: ['action'],
      tags: ['neo'],
      title: 'Header Saved Fixture',
    }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('resets edited draft fields when the loaded video changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <VideoMetadataForm
        contentTypes={contentTypes}
        genres={genres}
        onCancel={vi.fn()}
        onSave={onSave}
        video={createVideo()}
      />,
    );

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved draft');
    expect(screen.getByLabelText('Title')).toHaveValue('Unsaved draft');

    rerender(
      <VideoMetadataForm
        contentTypes={contentTypes}
        genres={genres}
        onCancel={vi.fn()}
        onSave={onSave}
        video={createVideo({
          description: 'A second clip.',
          id: 'video-2',
          tags: ['second'],
          title: 'Second Fixture',
        })}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Second Fixture'));
    expect(screen.getByLabelText('Description')).toHaveValue('A second clip.');
    expect(screen.getByText('second')).toBeInTheDocument();
  });
});

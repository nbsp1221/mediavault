import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import {
  type AddVideosViewProps,
  AddVideosView,
} from '../../../app/widgets/add-videos/ui/AddVideosView';

function createViewProps(overrides: Partial<AddVideosViewProps> = {}): AddVideosViewProps {
  return {
    canAddToLibrary: false,
    onAddToLibrary: vi.fn(),
    onChooseFiles: vi.fn(),
    onClearSession: vi.fn(),
    onContentTypeChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onGenreSlugsChange: vi.fn(),
    onRemoveSession: vi.fn(),
    onRetryUpload: vi.fn(),
    onTagsChange: vi.fn(),
    onTitleChange: vi.fn(),
    pageError: null,
    session: null,
    ...overrides,
  };
}

function createSession(
  overrides: Partial<NonNullable<AddVideosViewProps['session']>> = {},
): NonNullable<AddVideosViewProps['session']> {
  return {
    error: null,
    file: new File(['video-data'], 'fixture-video.mp4', { type: 'video/mp4' }),
    filename: 'fixture-video.mp4',
    metadata: {
      description: '',
      genreSlugs: [],
      tags: [],
      title: 'Fixture title',
    },
    mimeType: 'video/mp4',
    progressPercent: 0,
    size: 10,
    stagingId: null,
    status: 'uploading',
    successMessage: null,
    ...overrides,
  };
}

function renderView(props: AddVideosViewProps) {
  return render(
    <MemoryRouter>
      <AddVideosView {...props} />
    </MemoryRouter>,
  );
}

describe('AddVideosView', () => {
  test('can delegate page chrome to the product shell without rendering its legacy header', () => {
    renderView(createViewProps({ showPageHeader: false }));

    expect(screen.queryByRole('heading', { level: 1, name: 'Upload a video' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to Library' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Choose one video to upload' })).toBeInTheDocument();
  });

  test('renders the browser-first empty state instead of the old folder-scan flow', () => {
    renderView(createViewProps());

    expect(screen.getByRole('heading', { level: 1, name: 'Upload a video' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Library' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('heading', { level: 2, name: 'Choose one video to upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Video' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.getByText('Maximum file size: 4 GB')).toBeInTheDocument();
    expect(screen.getByText('Only one file can be uploaded at a time.')).toBeInTheDocument();
  });

  test('renders a single active upload card with inline status and textarea-based metadata editing', () => {
    renderView(createViewProps({
      session: createSession({
        metadata: {
          description: 'Fixture description',
          genreSlugs: [],
          tags: ['one', 'two'],
          title: 'Fixture title',
        },
        progressPercent: 45,
        size: 1_024 * 1_024,
      }),
    }));

    expect(screen.getByRole('heading', { level: 2, name: 'fixture-video.mp4' })).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
    expect(screen.getByText('video/mp4')).toBeInTheDocument();
    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByText('Uploading to the server staging area')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByLabelText('Title *')).toHaveValue('Fixture title');
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('Fixture description');
    expect(screen.getByRole('textbox', { name: 'Description' }).tagName).toBe('TEXTAREA');
    expect(screen.queryByText('Browser Playback Encoding')).not.toBeInTheDocument();
    expect(screen.queryByText('CPU H.264')).not.toBeInTheDocument();
    expect(screen.queryByText('GPU H.265')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to Library' })).toBeDisabled();
  });

  test('formats staged file sizes across byte, kilobyte, megabyte, and gigabyte boundaries', () => {
    const { rerender } = renderView(createViewProps({
      session: createSession({ size: 512 }),
    }));
    expect(screen.getByText('512 B')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AddVideosView {...createViewProps({ session: createSession({ size: 1024 }) })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AddVideosView {...createViewProps({ session: createSession({ size: 1024 * 1024 }) })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AddVideosView {...createViewProps({ session: createSession({ size: 1024 * 1024 * 1024 }) })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1.0 GB')).toBeInTheDocument();
  });

  test('accepts drag-and-drop files through the same browser upload callback', () => {
    const onChooseFiles = vi.fn();
    renderView(createViewProps({ onChooseFiles }));

    const dropZone = screen.getByText('Or drag and drop a file here.').closest('div');
    const file = new File(['video'], 'drop.mp4', { type: 'video/mp4' });
    expect(dropZone).not.toBeNull();

    fireEvent.dragEnter(dropZone!, { dataTransfer: { files: [file] } });
    expect(dropZone).toHaveClass('border-primary');
    fireEvent.dragOver(dropZone!, { dataTransfer: { files: [file] } });
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

    expect(onChooseFiles).toHaveBeenCalledWith([file]);
    expect(dropZone).not.toHaveClass('border-primary');
  });

  test('exposes active upload actions through explicit callbacks', async () => {
    const user = userEvent.setup();
    const onAddToLibrary = vi.fn();
    const onRemoveSession = vi.fn();

    renderView(createViewProps({
      canAddToLibrary: true,
      onAddToLibrary,
      onRemoveSession,
      session: createSession({
        progressPercent: 100,
        stagingId: 'staging-123',
        status: 'uploaded',
      }),
    }));

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Add to Library' }));

    expect(onRemoveSession).toHaveBeenCalledOnce();
    expect(onAddToLibrary).toHaveBeenCalledOnce();
  });

  test('forwards browser file and metadata field changes to the view owner', async () => {
    const onChooseFiles = vi.fn();
    const onDescriptionChange = vi.fn();
    const onTitleChange = vi.fn();
    const file = new File(['video'], 'fixture.mp4', { type: 'video/mp4' });

    const { container, rerender } = render(
      <MemoryRouter>
        <AddVideosView
          {...createViewProps({
            onChooseFiles,
          })}
        />
      </MemoryRouter>,
    );

    const fileInput = container.querySelector<HTMLInputElement>('#choose-video-input');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [file] } });
    expect(onChooseFiles).toHaveBeenCalledWith([file]);

    rerender(
      <MemoryRouter>
        <AddVideosView
          {...createViewProps({
            onDescriptionChange,
            onTitleChange,
            session: createSession({
              progressPercent: 100,
              stagingId: 'staging-123',
              status: 'uploaded',
            }),
          })}
        />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('Title *'), ' updated');
    await userEvent.type(screen.getByRole('textbox', { name: 'Description' }), 'details');

    expect(onTitleChange).toHaveBeenCalled();
    expect(onDescriptionChange).toHaveBeenCalled();
  });

  test('shows retry and completion actions in the correct session states', async () => {
    const user = userEvent.setup();
    const onRetryUpload = vi.fn();
    const onClearSession = vi.fn();

    const { rerender } = render(
      <MemoryRouter>
        <AddVideosView
          {...createViewProps({
            onRetryUpload,
            session: createSession({
              error: 'Upload failed.',
              progressPercent: 10,
              status: 'upload_failed',
            }),
          })}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Retry Upload' }));
    expect(onRetryUpload).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <AddVideosView
          {...createViewProps({
            onClearSession,
            session: createSession({
              progressPercent: 100,
              stagingId: 'staging-123',
              status: 'completed',
              successMessage: '"Fixture title" has been added to the library.',
            }),
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('"Fixture title" has been added to the library.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload Another Video' }));
    expect(onClearSession).toHaveBeenCalledOnce();
  });

  test('hides remove while the final library commit is in flight', () => {
    renderView(createViewProps({
      session: createSession({
        progressPercent: 100,
        stagingId: 'staging-123',
        status: 'adding_to_library',
      }),
    }));

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByText('Adding the staged file to the library')).toBeInTheDocument();
  });
});

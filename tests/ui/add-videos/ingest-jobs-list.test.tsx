import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { IngestJobsList } from '../../../app/pages/add-videos/ui/IngestJobsList';
import { createIngestJobView } from '../../support/ingest-job-fixture';

function renderJobs(overrides: Partial<Parameters<typeof IngestJobsList>[0]> = {}) {
  const props = {
    actionError: null,
    isLoading: false,
    jobs: [createIngestJobView()],
    onAction: vi.fn(),
    onRefresh: vi.fn(),
    pendingIds: [],
    statusError: null,
    ...overrides,
  };
  return {
    ...render(
      <MemoryRouter>
        <IngestJobsList {...props} />
      </MemoryRouter>,
    ),
    props,
  };
}

describe('processing job outcomes and controls', () => {
  test('queued work is not shown as a completed video or an invented percentage', async () => {
    const user = userEvent.setup();
    const { props } = renderJobs();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Watch video' })).not.toBeInTheDocument();
    expect(screen.queryByText(/has been added/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel processing' }));
    expect(props.onAction).toHaveBeenCalledWith(props.jobs[0], 'cancel');
    await user.click(screen.getByRole('button', { name: 'Refresh status' }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });

  test('active cancellation stays pending until server confirms a terminal state', () => {
    renderJobs({ jobs: [createIngestJobView({ cancelRequested: true, state: 'running' })] });
    expect(screen.getByText('Cancelling')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelling...' })).toBeDisabled();
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
  });

  test('retry reuses processing while source removal requires explicit confirmation', async () => {
    const user = userEvent.setup();
    const failed = createIngestJobView({ state: 'failed' });
    const onAction = vi.fn();
    const { props } = renderJobs({ jobs: [failed], onAction });
    expect(screen.getByText('Processing failed. Please retry.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry processing' }));
    expect(props.onAction).toHaveBeenCalledWith(failed, 'retry');
    onAction.mockClear();
    await user.click(screen.getByRole('button', { name: 'Remove staged file' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Remove this staged upload?')).toBeInTheDocument();
    expect(props.onAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Keep source' }));
    expect(props.onAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove staged file' }));
    await user.click(screen.getByRole('button', { name: 'Remove source' }));
    expect(props.onAction).toHaveBeenCalledWith(failed, 'remove');
  });

  test('published outcome alone exposes watch/edit and true completion message', () => {
    renderJobs({ jobs: [createIngestJobView({ state: 'succeeded' })] });
    expect(screen.getByText('"Fixture video" has been added to the library.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Watch video' })).toHaveAttribute(
      'href',
      '/player/video-123',
    );
    expect(screen.getByRole('link', { name: 'Edit video' })).toHaveAttribute(
      'href',
      '/videos/video-123/edit',
    );
    expect(screen.queryByRole('button', { name: 'Cancel processing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove staged file' })).not.toBeInTheDocument();
  });

  test('failed status reads show a recoverable warning without hiding current jobs', () => {
    renderJobs({ actionError: 'Action failed.', statusError: 'Status unavailable.' });
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Status unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Action failed.')).toBeInTheDocument();
  });

  test('empty history is distinct from loading and cancelled work remains retryable', () => {
    const { unmount } = renderJobs({ isLoading: true, jobs: [] });
    expect(screen.getByLabelText('Loading processing jobs')).toBeInTheDocument();
    unmount();
    const empty = renderJobs({ jobs: [] });
    expect(screen.getByText(/No processing jobs yet/)).toBeInTheDocument();
    empty.unmount();
    renderJobs({ jobs: [createIngestJobView({ state: 'cancelled' })], pendingIds: ['job-123'] });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry processing' })).toBeDisabled();
  });
});

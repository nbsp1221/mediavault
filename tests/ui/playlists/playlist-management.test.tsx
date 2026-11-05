import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { playlistRequest } from '../../../app/features/playlist-management/api/playlist-api';
import { AddToPlaylistDialog } from '../../../app/features/playlist-management/ui/AddToPlaylistDialog';
import { PlaylistEditorDialog } from '../../../app/features/playlist-management/ui/PlaylistEditorDialog';

const json = (value: object, status = 200) =>
  Response.json({ success: status < 400, ...value }, { status });

function choice(id: string, name: string, videoIds: string[] = []) {
  return {
    id,
    name,
    videoIds,
    ownerId: 'owner-1',
    type: 'user_created',
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Shared playlist management', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  test('validates a blank name locally and keeps server failures retryable', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ error: 'This name is already used.' }, 409))
      .mockResolvedValueOnce(json({ playlistId: 'created' }, 201));
    render(<PlaylistEditorDialog onOpenChange={vi.fn()} onSaved={onSaved} open />);
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    expect(await screen.findByText('Enter a playlist name.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Vault');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    expect(await screen.findByText('This name is already used.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Vault');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('created'));
  });
  test('does not navigate on an incomplete successful create response', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(json({}));
    render(<PlaylistEditorDialog onOpenChange={vi.fn()} onSaved={onSaved} open />);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Vault');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    expect(
      await screen.findByText('The playlist response did not include its ID.'),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
  test('loads only owned choices, disables duplicates, and adds the selected video', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          playlists: [
            choice('already', 'Already present', ['video-1']),
            choice('target', 'Target playlist'),
          ],
          hasMore: false,
          totalCount: 2,
        }),
      )
      .mockResolvedValueOnce(json({}));
    render(
      <MemoryRouter>
        <AddToPlaylistDialog
          onOpenChange={onOpenChange}
          open
          videoId="video-1"
          videoTitle="The video"
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: /Already present/ })).toBeDisabled();
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/playlists?owner=me&limit=100&offset=0',
      expect.any(Object),
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    await user.click(screen.getByRole('button', { name: /Target playlist/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/playlists/target/items',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ videoId: 'video-1' }) }),
    );
  });
  test('supports more choices and does not close the picker when adding fails', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({ playlists: [choice('first', 'First')], hasMore: true, totalCount: 2 }),
      )
      .mockResolvedValueOnce(
        json({ playlists: [choice('second', 'Second')], hasMore: false, totalCount: 2 }),
      )
      .mockResolvedValueOnce(json({ error: 'Access changed. Refresh the library.' }, 400));
    render(
      <MemoryRouter>
        <AddToPlaylistDialog
          onOpenChange={onOpenChange}
          open
          videoId="video-1"
          videoTitle="The video"
        />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Load more playlists' }));
    await user.click(await screen.findByRole('button', { name: /Second/ }));
    expect(await screen.findByText('Access changed. Refresh the library.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('list', { name: 'Your playlists' })).getAllByRole('button'),
    ).toHaveLength(2);
  });
  test('provides a real management destination when there are no owned playlists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ playlists: [], hasMore: false, totalCount: 0 }));
    render(
      <MemoryRouter>
        <AddToPlaylistDialog onOpenChange={vi.fn()} open videoId="video-1" videoTitle="The video" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Manage playlists' })).toHaveAttribute(
      'href',
      '/playlists',
    );
  });
  test('rejects malformed envelopes instead of treating unexpected JSON as success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(json({ error: 'Denied' }, 403));
    await expect(playlistRequest('/api/playlists')).rejects.toThrow('invalid playlist response');
    await expect(playlistRequest('/api/playlists')).rejects.toThrow('Denied');
  });
});

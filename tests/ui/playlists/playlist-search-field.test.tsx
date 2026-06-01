import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PlaylistSearchField } from '../../../app/features/playlist-search/ui/PlaylistSearchField';

describe('PlaylistSearchField', () => {
  test('renders an accessible playlist search input without a clear action when empty', () => {
    render(
      <PlaylistSearchField
        ariaLabel="Search playlists"
        onChange={() => {}}
        value=""
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search playlists' })).toHaveAttribute('placeholder', 'Search playlists...');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  test('submits typed values and clears non-empty search through the explicit clear action', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <PlaylistSearchField
        ariaLabel="Search playlists"
        onChange={onChange}
        value="vault"
      />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search playlists' }), 's');
    expect(onChange).toHaveBeenLastCalledWith('vaults');

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

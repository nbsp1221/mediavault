import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

import { AddVideosShell } from '../../../app/widgets/add-videos-shell/ui/AddVideosShell';

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    email: 'owner@example.com',
    id: 'user-1',
    role: 'admin',
  }),
}));

describe('AddVideosShell', () => {
  test('preserves the current protected shell structure around the add-videos page without a retired layout import', () => {
    render(
      <MemoryRouter initialEntries={['/add-videos']}>
        <AddVideosShell>
          <div>Upload flow content</div>
        </AddVideosShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('Mediavault')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Browse' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Manage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Search titles and tags...')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /upload/i })[0]).toHaveAttribute('href', '/add-videos');
    expect(screen.getByText('Upload flow content')).toBeInTheDocument();
    expect(screen.getByTitle('Account Menu')).toBeInTheDocument();
  });
});

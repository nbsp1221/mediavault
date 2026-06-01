import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { ProductRouteErrorView } from '../../../app/widgets/product-shell/ui/ProductRouteErrorView';

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    id: 'owner-1',
    role: 'admin',
    username: 'owner',
  }),
}));

describe('ProductRouteErrorView', () => {
  test('renders route errors inside the product shell frame without duplicate main landmarks', () => {
    render(
      <MemoryRouter initialEntries={['/playlists/missing']}>
        <ProductRouteErrorView
          activeRoute="playlists"
          title="Playlist unavailable"
          description={<p>The playlist could not be loaded.</p>}
        />
      </MemoryRouter>,
    );

    expect(within(screen.getByRole('banner')).getByRole('heading', { level: 1, name: 'Playlist unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Product navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Playlist unavailable' })).toBeInTheDocument();
    expect(screen.getByText('The playlist could not be loaded.')).toBeInTheDocument();
  });
});

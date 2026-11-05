import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { ErrorBoundary as DetailBoundary } from '../../../app/routes/playlists.$id';
import { ErrorBoundary as IndexBoundary } from '../../../app/routes/playlists._index';

vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => null }));
const cases: Array<{
  name: string;
  Boundary: ComponentType;
  error: Error | Response;
  heading: string;
}> = [
  {
    name: 'catalog unavailable',
    Boundary: IndexBoundary,
    error: new Error('Sensitive database details'),
    heading: 'Unable to load playlists',
  },
  {
    name: 'missing or inaccessible collection',
    Boundary: DetailBoundary,
    error: new Response('Not found', { status: 404 }),
    heading: 'Playlist not found',
  },
  {
    name: 'detail unavailable',
    Boundary: DetailBoundary,
    error: new Error('Sensitive database details'),
    heading: 'Unable to load playlist',
  },
];
describe('Playlist page error recovery', () => {
  test.each(cases)(
    '$name preserves public navigation without exposing implementation details',
    async ({ Boundary, error, heading }) => {
      const router = createMemoryRouter([
        {
          path: '/',
          hydrateFallbackElement: <p role="status">Loading page</p>,
          element: <p>Unavailable page</p>,
          errorElement: <Boundary />,
          loader: () => {
            // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown HTTP Responses for route errors.
            throw error;
          },
        },
      ]);
      render(<RouterProvider router={router} />);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(
        screen
          .getAllByRole('link', { name: 'Playlists' })
          .every((link) => link.getAttribute('href') === '/playlists'),
      ).toBe(true);
      expect(
        screen
          .getAllByRole('link', { name: 'Videos' })
          .every((link) => link.getAttribute('href') === '/'),
      ).toBe(true);
      expect(
        screen.queryByText(/Sensitive database details|invitation|coming soon/i),
      ).not.toBeInTheDocument();
    },
  );
});

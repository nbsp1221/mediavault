import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, redirect } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProductAccountMenu } from '../../../app/widgets/product-shell/ui/ProductAccountMenu';

const viewer = vi.hoisted(() => ({
  user: { id: 'owner-1', username: 'owner' } as { id: string; username: string } | null,
}));
vi.mock('~/shared/hooks/use-root-user', () => ({ useRootUser: () => viewer.user }));
describe('Account menu navigation', () => {
  beforeEach(() => {
    viewer.user = { id: 'owner-1', username: 'owner' };
  });
  test('offers anonymous viewers a visible sign-in link instead of authenticated actions', () => {
    viewer.user = null;
    const router = createMemoryRouter([{ path: '/', element: <ProductAccountMenu /> }]);
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Logout' })).not.toBeInTheDocument();
  });
  test('encodes the current local path, query and fragment into one return parameter', async () => {
    viewer.user = null;
    const user = userEvent.setup();
    const current =
      '/playlists/list-1?q=%EA%B0%80%EC%A1%B1+C%2B%2B&redirectTo=%2F%2Foutside.example#video-1';
    const router = createMemoryRouter(
      [
        { path: '/playlists/:id', element: <ProductAccountMenu /> },
        { path: '/login', element: <p>Sign in destination</p> },
      ],
      { initialEntries: [current] },
    );
    render(<RouterProvider router={router} />);
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', `/login?${new URLSearchParams({ redirectTo: current })}`);
    await user.click(link);
    expect(await screen.findByText('Sign in destination')).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect([...params.keys()]).toEqual(['redirectTo']);
    expect(params.get('redirectTo')).toBe(current);
  });
  test('does not generate a protocol-relative return target', () => {
    viewer.user = null;
    const router = createMemoryRouter([{ path: '*', element: <ProductAccountMenu /> }], {
      initialEntries: ['//outside.example/path'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
  });
  test('submits POST and follows the logout redirect instead of exposing a mutation GET link', async () => {
    const user = userEvent.setup();
    const methods: string[] = [];
    const router = createMemoryRouter([
      { path: '/', element: <ProductAccountMenu /> },
      {
        path: '/api/auth/logout',
        element: <p>Unexpected GET</p>,
        action: ({ request }) => {
          methods.push(request.method);
          return redirect('/login');
        },
      },
      { path: '/login', element: <p>Logged out destination</p> },
    ]);
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByText('owner')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Logout' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(await screen.findByText('Logged out destination')).toBeInTheDocument();
    expect(methods).toEqual(['POST']);
  });
});

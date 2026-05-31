import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import App, { ErrorBoundary, Layout, links } from '../../app/root';

vi.mock('~/shared/ui/sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    isRouteErrorResponse: (error: unknown) => Boolean((error as { isRouteErrorResponse?: boolean } | null)?.isRouteErrorResponse),
    Links: () => null,
    Meta: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
  };
});

describe('root UI shell', () => {
  test('declares the approved font resource hints and stylesheet links', () => {
    expect(links()).toEqual([
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap',
      },
    ]);
  });

  test('layout renders children and the shared toaster host', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <Layout>
          <main>Route content</main>
        </Layout>,
      );
    }
    finally {
      consoleError.mockRestore();
    }

    expect(screen.getByText('Route content')).toBeInTheDocument();
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });

  test('app marks hydration and renders child routes through the outlet', async () => {
    const router = createMemoryRouter([
      {
        element: <App />,
        children: [
          {
            path: '/',
            element: <main>Home outlet</main>,
          },
        ],
      },
    ], {
      initialEntries: ['/'],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Home outlet')).toBeInTheDocument();
    expect(document.documentElement.dataset.localStreamerHydrated).toBe('true');
  });

  test('error boundary renders unexpected errors in development-friendly copy', () => {
    render(<ErrorBoundary error={new Error('boom')} params={{}} loaderData={undefined} actionData={undefined} />);

    expect(screen.getByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  test('error boundary renders route error responses without exposing stack traces', () => {
    const routeError = {
      isRouteErrorResponse: true,
      status: 404,
      statusText: 'Not Found',
    };

    render(<ErrorBoundary error={routeError} params={{}} loaderData={undefined} actionData={undefined} />);

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
    expect(screen.queryByText(/at /)).not.toBeInTheDocument();
  });
});

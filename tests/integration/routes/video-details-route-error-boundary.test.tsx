import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

const useRouteErrorMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    isRouteErrorResponse: (error: unknown) => Boolean((error as { isRouteErrorResponse?: boolean } | null)?.isRouteErrorResponse),
    useRouteError: () => useRouteErrorMock(),
  };
});

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    id: 'owner-1',
    role: 'admin',
    username: 'owner',
  }),
}));

async function importVideoDetailsRoute() {
  return import('../../../app/routes/videos.$videoId.edit');
}

describe('video details route error boundary', () => {
  afterEach(() => {
    useRouteErrorMock.mockReset();
    vi.resetModules();
  });

  test('renders not-found errors inside the product shell frame', async () => {
    useRouteErrorMock.mockReturnValue({
      data: 'Video not found',
      isRouteErrorResponse: true,
      status: 404,
    });
    const { ErrorBoundary } = await importVideoDetailsRoute();

    const markup = renderToString(
      <MemoryRouter initialEntries={['/videos/missing/edit']}>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(markup).toContain('<header');
    expect(markup).toContain('Product navigation');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('We can’t find that video');
    expect(markup).toContain('Go to library');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });

  test('renders unexpected errors inside the product shell frame', async () => {
    useRouteErrorMock.mockReturnValue(new Error('storage unavailable'));
    const { ErrorBoundary } = await importVideoDetailsRoute();

    const markup = renderToString(
      <MemoryRouter initialEntries={['/videos/video-1/edit']}>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(markup).toContain('<header');
    expect(markup).toContain('Product navigation');
    expect(markup).toContain('We couldn’t load video details');
    expect(markup).toContain('storage unavailable');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });
});

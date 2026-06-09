import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

const useRouteErrorMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    isRouteErrorResponse: (error: unknown) => (
      typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'isRouteErrorResponse') === true
    ),
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

async function importHomeRoute() {
  return import('../../../app/routes/_index');
}

async function importAddVideosRoute() {
  return import('../../../app/routes/add-videos');
}

async function importPlayerRoute() {
  return import('../../../app/routes/player.$id');
}

describe('product shell route error boundaries', () => {
  afterEach(() => {
    useRouteErrorMock.mockReset();
    vi.resetModules();
  });

  test('renders home route failures inside the videos shell state', async () => {
    useRouteErrorMock.mockReturnValue(new Error('library storage unavailable'));
    const { ErrorBoundary } = await importHomeRoute();

    const markup = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(markup).toContain('<header');
    expect(markup).toContain('Product navigation');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Unable to load home library');
    expect(markup).toContain('library storage unavailable');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });

  test('renders upload route failures inside the upload shell state', async () => {
    useRouteErrorMock.mockReturnValue(new Error('metadata vocabulary unavailable'));
    const { ErrorBoundary } = await importAddVideosRoute();

    const markup = renderToString(
      <MemoryRouter initialEntries={['/add-videos']}>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(markup).toContain('<header');
    expect(markup).toContain('Product navigation');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Unable to load upload');
    expect(markup).toContain('metadata vocabulary unavailable');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });

  test('renders player not-found failures inside the videos shell state', async () => {
    useRouteErrorMock.mockReturnValue({
      data: 'Video not found',
      isRouteErrorResponse: true,
      status: 404,
    });
    const { ErrorBoundary } = await importPlayerRoute();

    const markup = renderToString(
      <MemoryRouter initialEntries={['/player/missing']}>
        <ErrorBoundary />
      </MemoryRouter>,
    );

    expect(markup).toContain('<header');
    expect(markup).toContain('Product navigation');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('We can’t find that video');
    expect(markup).toContain('Go to library');
    expect(markup).not.toContain('Browse playlists');
    expect(markup.match(/<main/g)).toHaveLength(1);
  });
});

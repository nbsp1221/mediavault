import type * as ReactRouter from 'react-router';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { requireProtectedPageSession } from '~/composition/server/auth';
import type { LoadVideoMetadataVocabularyUseCase } from '~/modules/library/application/use-cases/load-video-metadata-vocabulary.usecase';
import { routeArgs } from '../../helpers/route-args';

const requireProtectedPageSessionMock = vi.fn<typeof requireProtectedPageSession>();
const loadVideoMetadataVocabularyMock = vi.fn<LoadVideoMetadataVocabularyUseCase['execute']>();
const useLoaderDataMock = vi.fn<() => unknown>();
const addVideosPageRenderSpy = vi.fn((props: unknown) => (
  <div data-testid="add-videos-page-stub">{JSON.stringify(props)}</div>
));

const vocabularyFixture = {
  contentTypes: [{ active: true, label: 'Movie', slug: 'movie', sortOrder: 10 }],
  genres: [{ active: true, label: 'Action', slug: 'action', sortOrder: 10 }],
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');

  return {
    ...actual,
    useLoaderData: () => useLoaderDataMock(),
  };
});

vi.mock('~/composition/server/auth', () => ({
  requireProtectedPageSession: requireProtectedPageSessionMock,
}));

vi.mock('~/composition/server/library', () => ({
  getServerLibraryServices: () => ({
    loadVideoMetadataVocabulary: {
      execute: loadVideoMetadataVocabularyMock,
    },
  }),
}));

vi.mock('~/pages/add-videos/ui/AddVideosPage', () => ({
  AddVideosPage: (props: unknown) => addVideosPageRenderSpy(props),
}));

async function importAddVideosRoute() {
  return import('../../../app/routes/add-videos');
}

describe('/add-videos route adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const now = new Date('2026-11-02T00:00:00.000Z');
    requireProtectedPageSessionMock.mockResolvedValue({
      id: 'session-1',
      userId: 'owner-1',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      lastAccessedAt: now,
      isRevoked: false,
    });
    loadVideoMetadataVocabularyMock.mockResolvedValue({
      data: vocabularyFixture,
      ok: true,
    });
  });

  test('delegates the protected loader to auth and metadata vocabulary services', async () => {
    const { loader } = await importAddVideosRoute();

    await expect(
      loader(
        routeArgs({
          request: new Request('http://localhost/add-videos'),
        }),
      ),
    ).resolves.toEqual({
      contentTypes: vocabularyFixture.contentTypes,
      genres: vocabularyFixture.genres,
    });

    expect(requireProtectedPageSessionMock).toHaveBeenCalledWith(expect.any(Request));
    expect(loadVideoMetadataVocabularyMock).toHaveBeenCalledOnce();
  });

  test('renders the active page module from app/pages', async () => {
    useLoaderDataMock.mockReturnValue(vocabularyFixture);
    const routeModule = await importAddVideosRoute();

    const html = renderToString(
      <MemoryRouter>
        <routeModule.default />
      </MemoryRouter>,
    );

    expect(addVideosPageRenderSpy).toHaveBeenCalledExactlyOnceWith({
      contentTypes: vocabularyFixture.contentTypes,
      genres: vocabularyFixture.genres,
    });
    expect(html).toContain('movie');
  });
});

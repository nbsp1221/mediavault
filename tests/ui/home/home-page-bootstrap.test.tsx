import { render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { HomeLibraryVideo } from '../../../app/entities/library-video/model/library-video';
import { HomePage } from '../../../app/pages/home/ui/HomePage';

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => ({
    email: 'owner@example.com',
    id: 'user-1',
    role: 'admin',
  }),
}));

function createVideo(overrides: Partial<HomeLibraryVideo> = {}): HomeLibraryVideo {
  return {
    createdAt: new Date('2026-03-11T00:00:00.000Z'),
    duration: 180,
    id: 'video-1',
    isPrivate: false,
    permissions: {
      canDelete: true,
      canEdit: true,
      canManageVisibility: true,
    },
    tags: ['Action'],
    title: 'Catalog Fixture',
    videoUrl: '/videos/video-1/manifest.mpd',
    ...overrides,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('HomePage bootstrap compatibility', () => {
  test('applies loader bootstrap filters without changing the current Total / Showing behavior', () => {
    render(
      <MemoryRouter>
        <HomePage
          initialFilters={{
            includeTags: ['Action'],
            query: 'Action',
          }}
          videos={[
            createVideo(),
            createVideo({
              id: 'video-2',
              tags: ['Drama'],
              title: 'Second Fixture',
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'My Library' })).toBeInTheDocument();
    expect(screen.getByText('Total 2 videos • Showing 1')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Action')).toHaveLength(2);
    expect(screen.getByText('Active filters:')).toBeInTheDocument();
    expect(screen.getByText('Catalog Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Second Fixture')).not.toBeInTheDocument();
  });

  test('hydrates the same bootstrap output without SSR mismatch warnings', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props = {
      initialFilters: {
        includeTags: ['Action'],
        query: 'Action',
      },
      videos: [
        createVideo(),
        createVideo({
          id: 'video-2',
          tags: ['Drama'],
          title: 'Second Fixture',
        }),
      ],
    };
    const html = renderToString(
      <MemoryRouter>
        <HomePage {...props} />
      </MemoryRouter>,
    );
    const container = document.createElement('div');

    container.innerHTML = html;
    document.body.appendChild(container);
    hydrateRoot(
      container,
      <MemoryRouter>
        <HomePage {...props} />
      </MemoryRouter>,
    );

    expect(container.textContent).toContain('Total 2 videos');
    expect(container.textContent).toContain('Showing 1');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

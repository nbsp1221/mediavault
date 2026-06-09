import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';

vi.mock('~/shared/hooks/use-root-user', () => ({
  useRootUser: () => null,
}));

describe('PlayerPage SSR safety', () => {
  test('renders a server-safe loading shell for protected playback sources', async () => {
    const { PlayerPage } = await import('../../../app/pages/player/ui/PlayerPage');

    const html = renderToString(
      <MemoryRouter>
        <PlayerPage
          relatedVideos={[]}
          video={{
            createdAt: new Date('2026-03-09T00:00:00.000Z'),
            duration: 90,
            id: 'video-1',
            tags: ['vault'],
            title: 'Fixture player video',
            videoUrl: '/videos/video-1/manifest.mpd',
          }}
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Preparing secure playback');
    expect(html).toContain('Fixture player video');
    expect(html).toContain('Product sidebar');
    expect(html).toContain('Mediavault home');
    expect(html.match(/<main/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('Protected playback');
    expect(html).not.toContain('Vault player');
  });
});

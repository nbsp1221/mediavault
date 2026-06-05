import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const shellBackedFiles = [
  'app/routes/_index.tsx',
  'app/routes/add-videos.tsx',
  'app/routes/playlists._index.tsx',
  'app/routes/playlists.$id.tsx',
  'app/routes/videos.$videoId.edit.tsx',
  'app/pages/add-videos/ui/AddVideosPage.tsx',
  'app/pages/playlist-detail/ui/PlaylistDetailPage.tsx',
  'app/pages/playlists/ui/PlaylistsPage.tsx',
  'app/pages/video-details/ui/VideoDetailsPage.tsx',
  'app/widgets/home-library/ui/HomeLibraryWidget.tsx',
  'app/widgets/add-videos/ui/AddVideosView.tsx',
  'app/widgets/playlist-detail-view/ui/PlaylistDetailLayout.tsx',
  'app/widgets/playlist-detail-view/ui/PlaylistInfoPanel.tsx',
  'app/widgets/playlists-view/ui/PlaylistsView.tsx',
  'app/widgets/product-shell/ui/ProductShell.tsx',
  'app/widgets/video-details/ui/VideoDetailsView.tsx',
];

const productShellUiFiles = [
  'app/widgets/product-shell/ui/ProductAccountMenu.tsx',
  'app/widgets/product-shell/ui/ProductHeader.tsx',
  'app/widgets/product-shell/ui/ProductNavigation.tsx',
  'app/widgets/product-shell/ui/ProductRouteErrorView.tsx',
  'app/widgets/product-shell/ui/ProductShell.tsx',
  'app/widgets/product-shell/ui/ProductSidebar.tsx',
];

const retiredShellImports = [
  'HomeShell',
  'AddVideosShell',
  'home-navigation',
];

function read(path: string) {
  return readFileSync(path, 'utf8');
}

describe('product shell static boundaries', () => {
  test('shell-backed product routes do not import retired shell or home navigation modules', () => {
    for (const path of shellBackedFiles) {
      const source = read(path);

      for (const forbidden of retiredShellImports) {
        expect(source, `${path} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  test('login and player routes stay outside ProductShell', () => {
    for (const path of ['app/routes/login.tsx', 'app/routes/player.$id.tsx']) {
      const source = read(path);

      expect(source, `${path} must not import ProductShell`).not.toContain('ProductShell');
      expect(source, `${path} must not import product-shell widget`).not.toContain('widgets/product-shell');
    }
  });

  test('product shell UI does not copy prototype raw color classes', () => {
    for (const path of productShellUiFiles) {
      const source = read(path);

      expect(source, `${path} must use semantic tokens instead of raw prototype colors`).not.toMatch(
        /\b(?:bg|text|border|from|to|via)-\[#/u,
      );
    }
  });
});

import { describe, expect, test } from 'vitest';
import {
  getProductNavigationItems,
  groupProductNavigationItems,
  isProductNavigationItemActive,
} from '../../../app/widgets/product-shell/model/product-navigation';
import {
  getProductShellContentWidthClass,
  resolveProductShellActiveRoute,
} from '../../../app/widgets/product-shell/model/product-shell-route';

describe('Product navigation policy', () => {
  test('anonymous visitors can reach videos and public playlists', () => {
    expect(getProductNavigationItems(null).map((item) => [item.label, item.href])).toEqual([
      ['Videos', '/'],
      ['Playlists', '/playlists'],
    ]);
  });
  test.each([{ id: 'owner-1' }, { username: 'owner' }, 'owner-1', undefined])(
    'partial user state %j never enables upload navigation',
    (value) => {
      expect(getProductNavigationItems(value).map((item) => item.id)).toEqual([
        'videos',
        'playlists',
      ]);
    },
  );
  test('authenticated viewers see only implemented destinations', () => {
    const items = getProductNavigationItems({ id: 'owner-1', username: 'owner' });
    expect(items.map((item) => item.label)).toEqual(['Videos', 'Playlists', 'Upload']);
    expect(
      groupProductNavigationItems(items).map((group) => [
        group.label,
        group.items.map((item) => item.label),
      ]),
    ).toEqual([
      ['Library', ['Videos', 'Playlists']],
      ['Manage', ['Upload']],
    ]);
    expect(isProductNavigationItemActive(items[1], 'playlists')).toBe(true);
    expect(isProductNavigationItemActive(items[2], 'playlists')).toBe(false);
  });
  test('maps route families without treating login as a product route', () => {
    expect(resolveProductShellActiveRoute('/')).toBe('videos');
    expect(resolveProductShellActiveRoute('/videos/video-1/edit')).toBe('videos');
    expect(resolveProductShellActiveRoute('/playlists')).toBe('playlists');
    expect(resolveProductShellActiveRoute('/playlists/playlist-1')).toBe('playlists');
    expect(resolveProductShellActiveRoute('/add-videos')).toBe('upload');
    expect(resolveProductShellActiveRoute('/login')).toBeUndefined();
  });
  test('keeps explicit page widths and a conservative default', () => {
    expect(getProductShellContentWidthClass('wide')).toBe('max-w-7xl');
    expect(getProductShellContentWidthClass('standard')).toBe('max-w-5xl');
    expect(getProductShellContentWidthClass('narrow')).toBe('max-w-3xl');
    expect(getProductShellContentWidthClass('full')).toBe('max-w-none');
    expect(getProductShellContentWidthClass(undefined)).toBe('max-w-7xl');
  });
});

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

describe('product shell navigation model', () => {
  test('anonymous visitors see only videos', () => {
    const items = getProductNavigationItems(null);

    expect(items.map(item => item.label)).toEqual(['Videos']);
    expect(items[0]).toMatchObject({
      href: '/',
      id: 'videos',
      kind: 'link',
      section: 'library',
    });
  });

  test('unknown or partial session state fails closed to anonymous navigation', () => {
    expect(getProductNavigationItems({ id: 'owner-1' }).map(item => item.label)).toEqual(['Videos']);
    expect(getProductNavigationItems({ role: 'admin', username: 'owner' }).map(item => item.label)).toEqual(['Videos']);
    expect(getProductNavigationItems('owner-1').map(item => item.label)).toEqual(['Videos']);
  });

  test('authenticated owners see approved destinations and coming-soon actions', () => {
    const items = getProductNavigationItems({ id: 'owner-1', role: 'admin', username: 'owner' });

    expect(items.map(item => item.label)).toEqual([
      'Videos',
      'Playlists',
      'Favorites',
      'History',
      'Upload',
      'Settings',
    ]);
    expect(items.filter(item => item.kind === 'soon').map(item => item.label)).toEqual([
      'Favorites',
      'History',
      'Settings',
    ]);
    expect(items.filter(item => item.kind === 'soon').every(item => !('href' in item))).toBe(true);
    expect(items.map(item => item.label)).not.toEqual(expect.arrayContaining([
      'Collections',
      'Recently Added',
      'Import',
      'Trash',
      'Devices',
      'Security',
    ]));
  });

  test('groups owner navigation into product sidebar sections', () => {
    const groups = groupProductNavigationItems(getProductNavigationItems({ id: 'owner-1', role: 'admin', username: 'owner' }));

    expect(groups.map(group => [group.label, group.items.map(item => item.label)])).toEqual([
      ['Library', ['Videos', 'Playlists', 'Favorites', 'History']],
      ['Manage', ['Upload']],
      ['Account', ['Settings']],
    ]);
  });

  test('maps route families to active navigation destinations', () => {
    expect(resolveProductShellActiveRoute('/')).toBe('videos');
    expect(resolveProductShellActiveRoute('/videos/video-1/edit')).toBe('videos');
    expect(resolveProductShellActiveRoute('/playlists')).toBe('playlists');
    expect(resolveProductShellActiveRoute('/playlists/playlist-1')).toBe('playlists');
    expect(resolveProductShellActiveRoute('/add-videos')).toBe('upload');
    expect(resolveProductShellActiveRoute('/login')).toBeUndefined();
    expect(resolveProductShellActiveRoute('/player/video-1')).toBeUndefined();
  });

  test('coming-soon destinations never become active', () => {
    const soonItems = getProductNavigationItems({ id: 'owner-1', role: 'admin', username: 'owner' }).filter(item => item.kind === 'soon');

    expect(soonItems.every(item => !isProductNavigationItemActive(item, 'videos'))).toBe(true);
    expect(soonItems.every(item => !isProductNavigationItemActive(item, 'playlists'))).toBe(true);
    expect(soonItems.every(item => !isProductNavigationItemActive(item, 'upload'))).toBe(true);
  });

  test('content width classes fail to a conservative wide default', () => {
    expect(getProductShellContentWidthClass('wide')).toBe('max-w-7xl');
    expect(getProductShellContentWidthClass('standard')).toBe('max-w-5xl');
    expect(getProductShellContentWidthClass('narrow')).toBe('max-w-3xl');
    expect(getProductShellContentWidthClass('full')).toBe('max-w-none');
    expect(getProductShellContentWidthClass(undefined)).toBe('max-w-7xl');
  });
});

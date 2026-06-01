import type { ProductShellActiveRoute } from './product-navigation';

export type ProductShellContentWidth = 'wide' | 'standard' | 'narrow' | 'full';

export function resolveProductShellActiveRoute(pathname: string): ProductShellActiveRoute | undefined {
  if (pathname === '/' || pathname.startsWith('/videos/')) {
    return 'videos';
  }

  if (pathname === '/playlists' || pathname.startsWith('/playlists/')) {
    return 'playlists';
  }

  if (pathname === '/add-videos') {
    return 'upload';
  }

  return undefined;
}

export function getProductShellContentWidthClass(width: ProductShellContentWidth = 'wide') {
  if (width === 'standard') {
    return 'max-w-5xl';
  }

  if (width === 'narrow') {
    return 'max-w-3xl';
  }

  if (width === 'full') {
    return 'max-w-none';
  }

  return 'max-w-7xl';
}

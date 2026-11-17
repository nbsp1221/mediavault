import type { LucideIcon } from 'lucide-react';
import { ListVideo, Upload, Video } from 'lucide-react';

export type ProductShellActiveRoute = 'videos' | 'playlists' | 'upload';
export type ProductNavigationSection = 'library' | 'manage';

export interface ProductNavigationItem {
  href: string;
  icon: LucideIcon;
  id: ProductShellActiveRoute;
  kind: 'link';
  label: string;
  section: ProductNavigationSection;
}

export interface ProductNavigationSectionGroup {
  id: ProductNavigationSection;
  label: string;
  items: ProductNavigationItem[];
}

export const PRODUCT_NAVIGATION_SECTION_LABELS: Record<ProductNavigationSection, string> = {
  library: 'Library',
  manage: 'Manage',
};
const publicItems: ProductNavigationItem[] = [
  { href: '/', icon: Video, id: 'videos', kind: 'link', label: 'Videos', section: 'library' },
  {
    href: '/playlists',
    icon: ListVideo,
    id: 'playlists',
    kind: 'link',
    label: 'Playlists',
    section: 'library',
  },
];
const ownerItems: ProductNavigationItem[] = [
  ...publicItems,
  {
    href: '/add-videos',
    icon: Upload,
    id: 'upload',
    kind: 'link',
    label: 'Upload',
    section: 'manage',
  },
];

export function getProductNavigationItems(user: unknown): ProductNavigationItem[] {
  if (
    user &&
    typeof user === 'object' &&
    'id' in user &&
    typeof user.id === 'string' &&
    'username' in user &&
    typeof user.username === 'string'
  ) {
    return ownerItems;
  }
  return publicItems;
}

export function groupProductNavigationItems(
  items: ProductNavigationItem[],
): ProductNavigationSectionGroup[] {
  return (['library', 'manage'] as const)
    .map((id) => ({
      id,
      label: PRODUCT_NAVIGATION_SECTION_LABELS[id],
      items: items.filter((item) => item.section === id),
    }))
    .filter((group) => group.items.length > 0);
}

export function isProductNavigationItemActive(
  item: ProductNavigationItem,
  activeRoute?: ProductShellActiveRoute,
): boolean {
  return item.id === activeRoute;
}

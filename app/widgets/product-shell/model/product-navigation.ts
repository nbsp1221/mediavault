import type { LucideIcon } from 'lucide-react';
import { Clock, Heart, ListVideo, Settings, Upload, Video } from 'lucide-react';

export type ProductShellActiveRoute = 'videos' | 'playlists' | 'upload';
export type ProductNavigationSection = 'library' | 'manage' | 'account';

interface ProductNavigationUser {
  id: string;
  role: 'admin' | 'user';
  username: string;
}

export interface ProductNavigationLinkItem {
  href: string;
  icon: LucideIcon;
  id: ProductShellActiveRoute;
  kind: 'link';
  label: string;
  section: ProductNavigationSection;
}

export interface ProductNavigationSoonItem {
  icon: LucideIcon;
  id: 'favorites' | 'history' | 'settings';
  kind: 'soon';
  label: string;
  section: ProductNavigationSection;
  statusLabel: 'Soon';
  toastMessage: string;
}

export type ProductNavigationItem = ProductNavigationLinkItem | ProductNavigationSoonItem;

export interface ProductNavigationSectionGroup {
  id: ProductNavigationSection;
  label: string;
  items: ProductNavigationItem[];
}

export const PRODUCT_NAVIGATION_SECTION_LABELS: Record<ProductNavigationSection, string> = {
  account: 'Account',
  library: 'Library',
  manage: 'Manage',
};

const ownerNavigationItems: ProductNavigationItem[] = [
  {
    href: '/',
    icon: Video,
    id: 'videos',
    kind: 'link',
    label: 'Videos',
    section: 'library',
  },
  {
    href: '/playlists',
    icon: ListVideo,
    id: 'playlists',
    kind: 'link',
    label: 'Playlists',
    section: 'library',
  },
  {
    icon: Heart,
    id: 'favorites',
    kind: 'soon',
    label: 'Favorites',
    section: 'library',
    statusLabel: 'Soon',
    toastMessage: 'Favorites is coming soon.',
  },
  {
    icon: Clock,
    id: 'history',
    kind: 'soon',
    label: 'History',
    section: 'library',
    statusLabel: 'Soon',
    toastMessage: 'History is coming soon.',
  },
  {
    href: '/add-videos',
    icon: Upload,
    id: 'upload',
    kind: 'link',
    label: 'Upload',
    section: 'manage',
  },
  {
    icon: Settings,
    id: 'settings',
    kind: 'soon',
    label: 'Settings',
    section: 'account',
    statusLabel: 'Soon',
    toastMessage: 'Settings is coming soon.',
  },
];

const anonymousNavigationItems: ProductNavigationItem[] = [
  ownerNavigationItems[0],
];

function isProductNavigationUser(user: unknown): user is ProductNavigationUser {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const candidate = user as Partial<ProductNavigationUser>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.username === 'string' &&
    (candidate.role === 'admin' || candidate.role === 'user')
  );
}

export function getProductNavigationItems(user: unknown): ProductNavigationItem[] {
  return isProductNavigationUser(user) ? ownerNavigationItems : anonymousNavigationItems;
}

export function groupProductNavigationItems(
  items: ProductNavigationItem[],
): ProductNavigationSectionGroup[] {
  return (['library', 'manage', 'account'] as const)
    .map(section => ({
      id: section,
      label: PRODUCT_NAVIGATION_SECTION_LABELS[section],
      items: items.filter(item => item.section === section),
    }))
    .filter(group => group.items.length > 0);
}

export function isProductNavigationItemActive(
  item: ProductNavigationItem,
  activeRoute?: ProductShellActiveRoute,
): boolean {
  return item.kind === 'link' && item.id === activeRoute;
}

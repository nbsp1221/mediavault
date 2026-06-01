import { Shield } from 'lucide-react';
import { Link } from 'react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from '~/shared/ui/sidebar';
import type {
  ProductNavigationItem,
  ProductShellActiveRoute,
} from '../model/product-navigation';
import { ProductNavigation } from './ProductNavigation';

interface ProductSidebarProps {
  activeRoute?: ProductShellActiveRoute;
  items: ProductNavigationItem[];
  onNavigate?: () => void;
}

export function ProductSidebar({
  activeRoute,
  items,
  onNavigate,
}: ProductSidebarProps) {
  return (
    <Sidebar
      aria-label="Product sidebar"
      className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-sidebar-border bg-sidebar md:flex"
      collapsible="none"
    >
      <SidebarHeader className="h-18 justify-center px-6 py-0">
        <Link
          aria-label="Mediavault home"
          className="flex min-w-0 items-center gap-2 text-sidebar-foreground"
          onClick={onNavigate}
          to="/"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Shield aria-hidden className="size-4" />
          </span>
          <span className="truncate text-lg font-semibold leading-none">Mediavault</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <ProductNavigation
          activeRoute={activeRoute}
          idPrefix="product-sidebar-nav"
          items={items}
          onNavigate={onNavigate}
        />
      </SidebarContent>
    </Sidebar>
  );
}

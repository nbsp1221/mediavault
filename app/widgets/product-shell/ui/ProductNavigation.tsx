import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { cn } from '~/shared/lib/utils';
import { Badge } from '~/shared/ui/badge';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/shared/ui/sidebar';
import {
  type ProductNavigationItem,
  type ProductShellActiveRoute,
  groupProductNavigationItems,
  isProductNavigationItemActive,
} from '../model/product-navigation';

interface ProductNavigationProps {
  activeRoute?: ProductShellActiveRoute;
  idPrefix: string;
  items: ProductNavigationItem[];
  onNavigate?: () => void;
}

export function ProductNavigation({
  activeRoute,
  idPrefix,
  items,
  onNavigate,
}: ProductNavigationProps) {
  const location = useLocation();
  const groups = groupProductNavigationItems(items);

  return (
    <nav aria-label="Product navigation" className="flex flex-col gap-8">
      {groups.map(group => (
        <section aria-labelledby={`${idPrefix}-${group.id}`} className="flex flex-col gap-2" key={group.id}>
          <h2
            className="px-3 text-xs font-semibold uppercase leading-4 text-sidebar-foreground/55"
            id={`${idPrefix}-${group.id}`}
          >
            {group.label}
          </h2>
          <SidebarMenu className="gap-0.5">
            {group.items.map(item => (
              <ProductNavigationRow
                activeRoute={activeRoute}
                currentPathname={location.pathname}
                currentSearch={location.search}
                item={item}
                key={item.id}
                onNavigate={onNavigate}
              />
            ))}
          </SidebarMenu>
        </section>
      ))}
    </nav>
  );
}

function ProductNavigationRow({
  activeRoute,
  currentPathname,
  currentSearch,
  item,
  onNavigate,
}: {
  activeRoute?: ProductShellActiveRoute;
  currentPathname: string;
  currentSearch: string;
  item: ProductNavigationItem;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isActive = isProductNavigationItemActive(item, activeRoute);

  if (item.kind === 'soon') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-label={`${item.label}, ${item.statusLabel}`}
          className="h-11 gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/75 hover:text-sidebar-foreground md:h-9 [&_svg]:size-4 [&_svg]:shrink-0"
          onClick={() => {
            toast(item.toastMessage, { id: `product-nav-${item.id}` });
          }}
          type="button"
        >
          <Icon aria-hidden />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <Badge className="h-5 shrink-0 border-sidebar-border bg-transparent px-1.5 text-xs font-medium text-sidebar-foreground/45" variant="outline">{item.statusLabel}</Badge>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const href = item.href === '/' && currentPathname === '/'
    ? `${item.href}${currentSearch}`
    : item.href;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={cn(
          'h-11 gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/75 hover:text-sidebar-foreground md:h-9 [&_svg]:size-4 [&_svg]:shrink-0',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
        isActive={isActive}
      >
        <Link
          aria-current={isActive ? 'page' : undefined}
          onClick={onNavigate}
          to={href}
        >
          <Icon aria-hidden />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

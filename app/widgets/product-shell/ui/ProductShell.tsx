import { Shield } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useRootUser } from '~/shared/hooks/use-root-user';
import { cn } from '~/shared/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/shared/ui/sheet';
import { SidebarProvider } from '~/shared/ui/sidebar';
import {
  type ProductShellActiveRoute,
  getProductNavigationItems,
} from '../model/product-navigation';
import {
  type ProductShellContentWidth,
  getProductShellContentWidthClass,
  resolveProductShellActiveRoute,
} from '../model/product-shell-route';
import {
  type ProductAccountActionVisibility,
  type ProductHeaderMode,
  ProductHeader,
} from './ProductHeader';
import { ProductNavigation } from './ProductNavigation';
import { ProductSidebar } from './ProductSidebar';

export interface ProductShellProps {
  accountActionVisibility?: ProductAccountActionVisibility;
  actions?: ReactNode;
  activeRoute?: ProductShellActiveRoute;
  children: ReactNode;
  contentWidth?: ProductShellContentWidth;
  description?: ReactNode;
  headerMode?: ProductHeaderMode;
  leadingAction?: ReactNode;
  mobileActions?: ReactNode;
  title: string;
  toolbar?: ReactNode;
}

export function ProductShell({
  accountActionVisibility,
  actions,
  activeRoute,
  children,
  contentWidth = 'wide',
  description,
  headerMode,
  leadingAction,
  mobileActions,
  title,
  toolbar,
}: ProductShellProps) {
  const location = useLocation();
  const user = useRootUser();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationContentId = 'product-mobile-navigation';
  const navigationItems = getProductNavigationItems(user);
  const resolvedActiveRoute = activeRoute ?? resolveProductShellActiveRoute(location.pathname);
  const widthClassName = getProductShellContentWidthClass(contentWidth);

  useEffect(() => {
    const closeMobileNavigationOnDesktop = () => {
      if (window.innerWidth >= 768) {
        setIsMobileNavigationOpen(false);
      }
    };

    window.addEventListener('resize', closeMobileNavigationOnDesktop);
    return () => window.removeEventListener('resize', closeMobileNavigationOnDesktop);
  }, []);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-svh w-full bg-background text-foreground">
        <ProductSidebar
          activeRoute={resolvedActiveRoute}
          items={navigationItems}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <ProductHeader
            accountActionVisibility={accountActionVisibility}
            actions={actions}
            description={description}
            headerMode={headerMode}
            isNavigationOpen={isMobileNavigationOpen}
            leadingAction={leadingAction}
            mobileActions={mobileActions}
            navigationContentId={mobileNavigationContentId}
            onOpenNavigation={() => setIsMobileNavigationOpen(true)}
            title={title}
            toolbar={toolbar}
          />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className={cn('mx-auto w-full px-4 py-6 md:px-6 lg:py-8', widthClassName)}>
              {children}
            </div>
          </main>
        </div>

        <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
          <SheetContent
            aria-label="Navigation menu"
            className="w-[var(--sidebar-width-mobile)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            id={mobileNavigationContentId}
            side="left"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation menu</SheetTitle>
              <SheetDescription>
                Primary navigation links for the library, management, and account sections.
              </SheetDescription>
            </SheetHeader>
            <div className="flex h-full flex-col">
              <div className="flex h-18 items-center px-6">
                <Link
                  aria-label="Mediavault home"
                  className="flex min-w-0 items-center gap-2 text-sidebar-foreground"
                  onClick={() => setIsMobileNavigationOpen(false)}
                  to="/"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    <Shield aria-hidden className="size-4" />
                  </span>
                  <span className="truncate text-lg font-semibold leading-none">Mediavault</span>
                </Link>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                <ProductNavigation
                  activeRoute={resolvedActiveRoute}
                  idPrefix="product-mobile-nav"
                  items={navigationItems}
                  onNavigate={() => setIsMobileNavigationOpen(false)}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </SidebarProvider>
  );
}

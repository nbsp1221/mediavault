import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '~/shared/lib/utils';
import { Button } from '~/shared/ui/button';
import { ProductAccountMenu } from './ProductAccountMenu';

export type ProductAccountActionVisibility = 'default' | 'desktop-only';
export type ProductHeaderMode = 'browse' | 'context';

interface ProductHeaderProps {
  accountActionVisibility?: ProductAccountActionVisibility;
  actions?: ReactNode;
  description?: ReactNode;
  headerMode?: ProductHeaderMode;
  isNavigationOpen: boolean;
  leadingAction?: ReactNode;
  mobileActions?: ReactNode;
  navigationContentId: string;
  onOpenNavigation: () => void;
  title: string;
  toolbar?: ReactNode;
}

export function ProductHeader({
  accountActionVisibility = 'default',
  actions,
  description,
  headerMode = 'context',
  isNavigationOpen,
  leadingAction,
  mobileActions,
  navigationContentId,
  onOpenNavigation,
  title,
  toolbar,
}: ProductHeaderProps) {
  const isBrowseHeader = headerMode === 'browse';
  const shouldShowMobileNavigationTrigger = !leadingAction;
  const actionContent = mobileActions
    ? (
        <>
          <div className="hidden items-center gap-2 md:flex">
            {actions}
          </div>
          <div className="flex items-center gap-2 md:hidden">
            {mobileActions}
          </div>
        </>
      )
    : actions;

  return (
    <header className="border-b border-border/70 bg-background/95">
      <div className="flex h-14 min-w-0 items-center gap-3 px-4 md:h-18 md:px-8">
        {shouldShowMobileNavigationTrigger ? (
          <Button
            aria-controls={navigationContentId}
            aria-expanded={isNavigationOpen}
            aria-label="Open navigation menu"
            className="size-11 md:hidden"
            onClick={onOpenNavigation}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Menu aria-hidden />
          </Button>
        ) : null}
        {leadingAction ? (
          <div className="shrink-0">
            {leadingAction}
          </div>
        ) : null}
        <div
          className={cn(
            'min-w-0',
            isBrowseHeader ? 'shrink-0 md:w-44' : 'flex-1',
          )}
        >
          <h1
            className="truncate text-base font-semibold leading-6 text-foreground md:text-lg"
          >
            {title}
          </h1>
          {description && !isBrowseHeader ? (
            <div className="hidden truncate text-xs leading-5 text-muted-foreground md:block">
              {description}
            </div>
          ) : null}
        </div>

        {toolbar && isBrowseHeader ? (
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
            {toolbar}
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actionContent ? (
            <div className={cn('items-center gap-2', isBrowseHeader ? 'hidden md:flex' : 'flex')}>
              {actionContent}
            </div>
          ) : null}
          <div
            className={cn(
              accountActionVisibility === 'desktop-only' && 'hidden md:block',
            )}
          >
            <ProductAccountMenu />
          </div>
        </div>
      </div>

      {description && isBrowseHeader ? (
        <div className="border-t border-border/60 px-4 py-2 text-sm text-muted-foreground md:px-8">
          <p className="truncate">
            {description}
          </p>
        </div>
      ) : null}

      {toolbar && !isBrowseHeader ? (
        <div className="flex min-w-0 flex-col gap-3 border-t border-border/60 px-4 py-3 md:flex-row md:items-center md:px-8">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}

import type { ComponentProps } from 'react';
import { RouteErrorView } from '~/shared/ui/route-error-view';
import type { ProductShellActiveRoute } from '../model/product-navigation';
import type { ProductShellContentWidth } from '../model/product-shell-route';
import { ProductShell } from './ProductShell';

type RouteErrorViewProps = ComponentProps<typeof RouteErrorView>;

interface ProductRouteErrorViewProps extends Omit<RouteErrorViewProps, 'headingLevel' | 'layout'> {
  activeRoute?: ProductShellActiveRoute;
  contentWidth?: ProductShellContentWidth;
}

export function ProductRouteErrorView({
  activeRoute,
  contentWidth = 'narrow',
  title,
  ...props
}: ProductRouteErrorViewProps) {
  return (
    <ProductShell
      activeRoute={activeRoute}
      contentWidth={contentWidth}
      title={title ?? 'Something went wrong'}
    >
      <RouteErrorView
        {...props}
        headingLevel={2}
        title={title}
      />
    </ProductShell>
  );
}

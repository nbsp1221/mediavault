import type { ComponentProps, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '~/shared/lib/utils';
import { Button } from '~/shared/ui/button';

type ButtonVariant = ComponentProps<typeof Button>['variant'];
type Tone = 'neutral' | 'warning' | 'critical';
type RouteErrorButtonVariant = Exclude<ButtonVariant, null | undefined>;

export interface RouteErrorAction {
  label: string;
  to: string;
  variant?: RouteErrorButtonVariant;
  icon?: ReactNode;
}

export interface RouteErrorViewProps {
  title?: string;
  description?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  actions?: RouteErrorAction[];
  footnote?: ReactNode;
  headingLevel?: 1 | 2;
  layout?: 'content' | 'standalone';
  children?: ReactNode;
}

const toneTokens: Record<Tone, { container: string; icon: string; title: string; description: string }> = {
  neutral: {
    container: 'border-border/70 bg-card/80 backdrop-blur-sm shadow-lg',
    icon: 'bg-primary/10 text-primary',
    title: 'text-foreground',
    description: 'text-muted-foreground',
  },
  warning: {
    container: 'border-amber-400/50 bg-amber-500/10 shadow-lg',
    icon: 'bg-amber-500/20 text-amber-600 dark:text-amber-300',
    title: 'text-amber-900 dark:text-amber-100',
    description: 'text-amber-900/80 dark:text-amber-200/80',
  },
  critical: {
    container: 'border-destructive/40 bg-destructive/10 shadow-lg',
    icon: 'bg-destructive/20 text-destructive',
    title: 'text-destructive',
    description: 'text-destructive/80',
  },
};

export function RouteErrorView({
  title = 'Something went wrong',
  description = <p>Please try again in a moment or pick a different destination.</p>,
  tone = 'neutral',
  icon,
  actions,
  footnote,
  headingLevel = 1,
  layout = 'content',
  children,
}: RouteErrorViewProps) {
  const resolvedTone = toneTokens[tone];
  const resolvedIcon = icon ?? <Info className="h-6 w-6" aria-hidden />;
  const resolvedActions = actions?.length ? actions : [{ label: 'Go to home', to: '/' }];
  const Heading = headingLevel === 2 ? 'h2' : 'h1';

  const content = (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <div className={cn('rounded-3xl border p-8', resolvedTone.container)}>
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <span className={cn('inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full', resolvedTone.icon)}>
              {resolvedIcon}
            </span>
            <div className="space-y-3">
              <Heading className={cn('text-2xl font-semibold leading-tight', resolvedTone.title)}>{title}</Heading>
              <div className={cn('text-base leading-relaxed', resolvedTone.description)}>{description}</div>
            </div>
          </div>

          {children}

          <div className="flex flex-wrap gap-3">
            {resolvedActions.map(({ label, to, variant, icon: actionIcon }) => (
              <Button key={`${label}-${to}`} asChild variant={variant ?? 'default'} className="gap-2">
                <Link to={to}>
                  {actionIcon}
                  <span>{label}</span>
                </Link>
              </Button>
            ))}
          </div>

          {footnote ? <p className="text-sm text-muted-foreground">{footnote}</p> : null}
        </div>
      </div>
    </div>
  );

  if (layout === 'standalone') {
    return <div className="min-h-screen bg-background">{content}</div>;
  }

  return content;
}

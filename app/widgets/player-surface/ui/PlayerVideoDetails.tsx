import { X } from 'lucide-react';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Separator } from '~/shared/ui/separator';

interface PlayerVideoDetailsProps {
  clearTagFilter: () => void;
  createdAtLabel: string;
  description?: string;
  durationLabel: string;
  hasTagFilter: boolean;
  tagItems: Array<{
    isActive: boolean;
    value: string;
  }>;
  title: string;
  toggleTagFilter: (tag: string) => void;
}

export function PlayerVideoDetails({
  clearTagFilter,
  createdAtLabel,
  description,
  durationLabel,
  hasTagFilter,
  tagItems,
  title,
  toggleTagFilter,
}: PlayerVideoDetailsProps) {
  return (
    <section aria-label="Video details" className="flex flex-col gap-4 lg:gap-5">
      <h2 className="text-xl font-bold leading-tight lg:text-2xl">
        {title}
      </h2>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium">Duration:</span>
        <span>{durationLabel}</span>
        <span className="hidden sm:inline">&bull;</span>
        <span className="font-medium">Added:</span>
        <span>{createdAtLabel}</span>
      </div>

      {(description || tagItems.length > 0) ? <Separator /> : null}

      {description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold lg:text-base">Description</h2>
          <p className="text-sm leading-relaxed text-muted-foreground lg:text-base">
            {description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold lg:text-base">Tags</h2>
          {hasTagFilter ? (
            <Button
              className="h-7 px-2 text-xs"
              onClick={clearTagFilter}
              size="sm"
              variant="ghost"
            >
              <X />
              Clear filter
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5 lg:gap-2">
          {tagItems.length > 0 ? tagItems.map(tag => (
            <Badge
              asChild
              className="cursor-pointer transition-colors"
              key={tag.value}
              variant={tag.isActive ? 'default' : 'secondary'}
            >
              <button onClick={() => toggleTagFilter(tag.value)} type="button">
                #{tag.value}
              </button>
            </Badge>
          )) : (
            <span className="text-xs text-muted-foreground">No tags</span>
          )}
        </div>
      </section>
    </section>
  );
}

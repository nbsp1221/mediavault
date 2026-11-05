import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { formatVideoTagLabel } from '~/modules/library/domain/video-tag';
import {
  type HomeLibraryFilters,
  hasHomeLibraryActiveFilters,
} from '~/pages/home/model/home-library-filters';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';

interface HomeAppliedFiltersBarProps {
  contentTypes: VideoTaxonomyItem[];
  filters: HomeLibraryFilters;
  genres: VideoTaxonomyItem[];
  onChange: (filters: HomeLibraryFilters) => void;
  onClearAll: () => void;
}

function getTaxonomyLabel(options: VideoTaxonomyItem[], slug: string) {
  return options.find((option) => option.slug === slug)?.label ?? slug;
}

function FilterBadge({
  children,
  onRemove,
  removeLabel,
  variant = 'secondary',
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}) {
  return (
    <Badge variant={variant} className="gap-1 px-3 py-1">
      {children}
      <Button
        aria-label={removeLabel}
        className="h-4 w-4 p-0 hover:bg-transparent"
        onClick={onRemove}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  );
}

export function HomeAppliedFiltersBar({
  contentTypes,
  filters,
  genres,
  onChange,
  onClearAll,
}: HomeAppliedFiltersBarProps) {
  if (!hasHomeLibraryActiveFilters(filters)) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
      <span className="text-sm font-medium text-muted-foreground">Active filters:</span>
      <div className="flex flex-1 flex-wrap gap-2">
        {filters.query.trim().length > 0 ? (
          <FilterBadge
            removeLabel="Clear search query"
            onRemove={() => onChange({ ...filters, query: '' })}
          >
            Query: {filters.query}
          </FilterBadge>
        ) : null}

        {filters.includeTags.map((tag) => (
          <FilterBadge
            key={`include-${tag}`}
            removeLabel={`Remove required ${formatVideoTagLabel(tag)} tag`}
            onRemove={() =>
              onChange({
                ...filters,
                includeTags: filters.includeTags.filter((existingTag) => existingTag !== tag),
              })
            }
          >
            Has: {formatVideoTagLabel(tag)}
          </FilterBadge>
        ))}

        {filters.excludeTags.map((tag) => (
          <FilterBadge
            key={`exclude-${tag}`}
            removeLabel={`Remove excluded ${formatVideoTagLabel(tag)} tag`}
            onRemove={() =>
              onChange({
                ...filters,
                excludeTags: filters.excludeTags.filter((existingTag) => existingTag !== tag),
              })
            }
            variant="outline"
          >
            Not: {formatVideoTagLabel(tag)}
          </FilterBadge>
        ))}

        {filters.contentTypeSlug ? (
          <FilterBadge
            removeLabel="Clear content type filter"
            onRemove={() => onChange({ ...filters, contentTypeSlug: undefined })}
            variant="outline"
          >
            Type: {getTaxonomyLabel(contentTypes, filters.contentTypeSlug)}
          </FilterBadge>
        ) : null}

        {filters.genreSlugs.map((slug) => (
          <FilterBadge
            key={`genre-${slug}`}
            removeLabel={`Remove ${getTaxonomyLabel(genres, slug)} genre filter`}
            onRemove={() =>
              onChange({
                ...filters,
                genreSlugs: filters.genreSlugs.filter((existingSlug) => existingSlug !== slug),
              })
            }
            variant="outline"
          >
            Genre: {getTaxonomyLabel(genres, slug)}
          </FilterBadge>
        ))}
      </div>
      <Button onClick={onClearAll} size="sm" type="button" variant="outline">
        Clear all
      </Button>
    </div>
  );
}

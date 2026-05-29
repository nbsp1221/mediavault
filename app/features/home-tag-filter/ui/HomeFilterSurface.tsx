import { useEffect, useState } from 'react';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import type { HomeLibraryFilters } from '~/widgets/home-library/model/home-library-filters';
import { VideoTagInput } from '~/features/video-metadata/ui/VideoTagInput';
import {
  VideoTaxonomyMultiSelect,
  VideoTaxonomySingleSelect,
} from '~/features/video-metadata/ui/VideoTaxonomyCombobox';
import { Button } from '~/shared/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '~/shared/ui/drawer';
import { Label } from '~/shared/ui/label';
import { Separator } from '~/shared/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/shared/ui/sheet';
import {
  clearHomeLibraryFilters,
  createHomeLibraryFilters,
} from '~/widgets/home-library/model/home-library-filters';

interface HomeFilterSurfaceProps {
  contentTypes: VideoTaxonomyItem[];
  filters: HomeLibraryFilters;
  genres: VideoTaxonomyItem[];
  onFiltersChange: (filters: HomeLibraryFilters) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia('(min-width: 768px)').matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}

function FilterFields({
  contentTypes,
  disabled,
  filters,
  genres,
  onFiltersChange,
}: {
  contentTypes: VideoTaxonomyItem[];
  disabled?: boolean;
  filters: HomeLibraryFilters;
  genres: VideoTaxonomyItem[];
  onFiltersChange: (filters: HomeLibraryFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Require tags</Label>
        <p className="text-sm text-muted-foreground">Videos must contain all of these tags.</p>
        <VideoTagInput
          ariaLabel="Require tags"
          disabled={disabled}
          onChange={includeTags => onFiltersChange(createHomeLibraryFilters({ ...filters, includeTags }))}
          placeholder="Add required tags"
          value={filters.includeTags}
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Exclude tags</Label>
        <p className="text-sm text-muted-foreground">Videos with any of these tags will be hidden.</p>
        <VideoTagInput
          ariaLabel="Exclude tags"
          disabled={disabled}
          onChange={excludeTags => onFiltersChange(createHomeLibraryFilters({ ...filters, excludeTags }))}
          placeholder="Add excluded tags"
          value={filters.excludeTags}
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Content type</Label>
        <VideoTaxonomySingleSelect
          ariaLabel="Content type filter"
          disabled={disabled}
          onChange={contentTypeSlug => onFiltersChange(createHomeLibraryFilters({ ...filters, contentTypeSlug }))}
          options={contentTypes}
          placeholder="No content type"
          value={filters.contentTypeSlug}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Genre</Label>
        <VideoTaxonomyMultiSelect
          ariaLabel="Genre filter"
          disabled={disabled}
          onChange={genreSlugs => onFiltersChange(createHomeLibraryFilters({ ...filters, genreSlugs }))}
          options={genres}
          placeholder="No genres"
          value={filters.genreSlugs}
        />
      </div>
    </div>
  );
}

function DesktopFilterSheet({
  contentTypes,
  filters,
  genres,
  onFiltersChange,
  onOpenChange,
  open,
}: HomeFilterSurfaceProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="home-filter-sheet-description">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription id="home-filter-sheet-description">
            Refine your library with tags and metadata.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <FilterFields
            contentTypes={contentTypes}
            filters={filters}
            genres={genres}
            onFiltersChange={onFiltersChange}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileFilterDrawer({
  contentTypes,
  filters,
  genres,
  onFiltersChange,
  onOpenChange,
  open,
}: HomeFilterSurfaceProps) {
  const [draftFilters, setDraftFilters] = useState(filters);

  const applyDraftFilters = () => {
    onFiltersChange(draftFilters);
    onOpenChange(false);
  };

  const resetDraftAndApply = () => {
    const resetFilters = clearHomeLibraryFilters(filters, { preserveQuery: true });

    setDraftFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>Refine your library with tags and metadata.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <FilterFields
            contentTypes={contentTypes}
            filters={draftFilters}
            genres={genres}
            onFiltersChange={setDraftFilters}
          />
        </div>
        <DrawerFooter>
          <Button onClick={applyDraftFilters} type="button">
            Apply
          </Button>
          <Button onClick={resetDraftAndApply} type="button" variant="outline">
            Reset
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function createMobileFilterDrawerKey(filters: HomeLibraryFilters, open: boolean) {
  if (!open) {
    return 'closed';
  }

  const normalizedFilters = createHomeLibraryFilters(filters);

  return JSON.stringify(normalizedFilters);
}

export function HomeFilterSurface({
  contentTypes,
  filters,
  genres,
  onFiltersChange,
  onOpenChange,
  open,
}: HomeFilterSurfaceProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <DesktopFilterSheet
        contentTypes={contentTypes}
        filters={filters}
        genres={genres}
        onFiltersChange={onFiltersChange}
        onOpenChange={onOpenChange}
        open={open}
      />
    );
  }

  const mobileDrawerKey = createMobileFilterDrawerKey(filters, open);

  return (
    <MobileFilterDrawer
      key={mobileDrawerKey}
      contentTypes={contentTypes}
      filters={filters}
      genres={genres}
      onFiltersChange={onFiltersChange}
      onOpenChange={onOpenChange}
      open={open}
    />
  );
}

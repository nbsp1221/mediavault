import type { ReactNode } from 'react';
import { SlidersHorizontal, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { LibraryVideoCard } from '~/entities/library-video/ui/LibraryVideoCard';
import { HomeSearchField } from '~/features/home-search/ui/HomeSearchField';
import { HomeAppliedFiltersBar } from '~/features/home-tag-filter/ui/HomeAppliedFiltersBar';
import { HomeFilterSurface } from '~/features/home-tag-filter/ui/HomeFilterSurface';
import { DeleteVideoConfirmDialog } from '~/features/video-delete/ui/DeleteVideoConfirmDialog';
import { useRootUser } from '~/shared/hooks/use-root-user';
import { Button } from '~/shared/ui/button';
import {
  type HomeLibraryFilters,
  clearHomeLibraryFilters,
  createHomeLibraryFilters,
  getHomeLibraryActiveFilterCount,
  hasHomeLibraryActiveFilters,
  toggleHomeLibraryTag,
  writeHomeLibraryFiltersToSearchParams,
} from '../model/home-library-filters';
import { useHomeLibraryView } from '../model/useHomeLibraryView';

export interface HomeLibraryShellRenderProps {
  actions: ReactNode;
  children: ReactNode;
  description?: string;
  title: string;
  toolbar: ReactNode;
}

interface HomeLibraryWidgetProps {
  contentTypes?: VideoTaxonomyItem[];
  genres?: VideoTaxonomyItem[];
  videos: HomeLibraryVideo[];
  initialFilters?: Partial<HomeLibraryFilters>;
  renderShell?: (props: HomeLibraryShellRenderProps) => ReactNode;
}

function renderDefaultShell({
  actions,
  children,
  description,
  title,
  toolbar,
}: HomeLibraryShellRenderProps) {
  return (
    <section>
      <header>
        <h1>{title}</h1>
        {description ? (
          <p>{description}</p>
        ) : null}
        {actions}
        {toolbar}
      </header>
      {children}
    </section>
  );
}

export function HomeLibraryWidget({
  contentTypes = [],
  genres = [],
  videos,
  initialFilters,
  renderShell = renderDefaultShell,
}: HomeLibraryWidgetProps) {
  const location = useLocation();
  const user = useRootUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HomeLibraryVideo | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const view = useHomeLibraryView({
    initialFilters,
    initialVideos: videos,
  });

  const applyFilters = (
    nextFilters: HomeLibraryFilters,
    options: { replace?: boolean } = {},
  ) => {
    const normalizedFilters = createHomeLibraryFilters(nextFilters);

    view.replaceSearchFilters(normalizedFilters);
    setSearchParams(
      writeHomeLibraryFiltersToSearchParams(searchParams, normalizedFilters),
      { replace: options.replace ?? false },
    );
  };

  const handleSearchChange = (query: string) => {
    applyFilters({
      ...view.searchFilters,
      query,
    }, { replace: true });
  };

  const handleTagToggle = (tag: string) => {
    applyFilters({
      ...view.searchFilters,
      includeTags: toggleHomeLibraryTag(view.searchFilters.includeTags, tag),
    });
  };

  const handleClearAllFilters = () => {
    applyFilters(clearHomeLibraryFilters(view.searchFilters));
  };

  const activeFilterCount = getHomeLibraryActiveFilterCount(view.searchFilters);
  const hasActiveFilters = hasHomeLibraryActiveFilters(view.searchFilters);
  const returnTarget = `${location.pathname}${location.search}`;
  const pageTitle = 'Videos';

  const createEditHref = (video: HomeLibraryVideo) => {
    return `/videos/${video.id}/edit?redirectTo=${encodeURIComponent(returnTarget)}`;
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await view.handleDeleteVideo(deleteTarget);
      setDeleteTarget(null);
    }
    catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete video');
    }
    finally {
      setIsDeleting(false);
    }
  };

  const actions = user
    ? (
        <Button asChild size="sm">
          <Link to="/add-videos">
            <Upload data-icon="inline-start" />
            Upload
          </Link>
        </Button>
      )
    : null;
  const toolbar = (
    <>
      <div className="w-full md:max-w-xl">
        <HomeSearchField
          ariaLabel="Search library (desktop)"
          onChange={handleSearchChange}
          value={view.searchFilters.query}
        />
      </div>
      <Button
        aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
        onClick={() => setIsFiltersOpen(true)}
        type="button"
        variant="outline"
      >
        <SlidersHorizontal data-icon="inline-start" />
        Filters
        {activeFilterCount > 0 ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {activeFilterCount}
          </span>
        ) : null}
      </Button>
    </>
  );

  return renderShell({
    actions,
    children: (
      <>
        <div className="flex flex-col gap-6">
          <HomeAppliedFiltersBar
            contentTypes={contentTypes}
            filters={view.searchFilters}
            genres={genres}
            onChange={applyFilters}
            onClearAll={handleClearAllFilters}
          />

          <div>
            {view.videos.length === 0
              ? (
                  <div className="py-12 text-center">
                    <p className="font-medium">
                      {hasActiveFilters ? 'No videos match these filters.' : 'No videos found.'}
                    </p>
                    {hasActiveFilters ? (
                      <>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Clear one or more filters to recover the result set.
                        </p>
                        <div className="mt-4 flex justify-center">
                          <Button onClick={handleClearAllFilters} type="button" variant="outline">
                            Clear all
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-6">
                    {view.videos.map(video => (
                      <LibraryVideoCard
                        editHref={video.permissions.canEdit ? createEditHref(video) : undefined}
                        key={video.id}
                        onDelete={video.permissions.canDelete
                          ? (target) => {
                              setDeleteError(null);
                              setDeleteTarget(target);
                            }
                          : undefined}
                        onTagClick={handleTagToggle}
                        video={video}
                      />
                    ))}
                  </div>
                )}
          </div>
        </div>

        <DeleteVideoConfirmDialog
          error={deleteError}
          isDeleting={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={() => void handleDeleteConfirm()}
          open={Boolean(deleteTarget)}
          videoTitle={deleteTarget?.title ?? ''}
        />
        <HomeFilterSurface
          contentTypes={contentTypes}
          filters={view.searchFilters}
          genres={genres}
          onFiltersChange={applyFilters}
          onOpenChange={setIsFiltersOpen}
          open={isFiltersOpen}
        />
      </>
    ),
    title: pageTitle,
    toolbar,
  });
}

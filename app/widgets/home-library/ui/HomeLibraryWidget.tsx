import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { LibraryVideoCard } from '~/entities/library-video/ui/LibraryVideoCard';
import { HomeQuickViewDialog } from '~/features/home-quick-view/ui/HomeQuickViewDialog';
import { HomeAppliedFiltersBar } from '~/features/home-tag-filter/ui/HomeAppliedFiltersBar';
import { HomeFilterSurface } from '~/features/home-tag-filter/ui/HomeFilterSurface';
import { Button } from '~/shared/ui/button';
import { HomeShell } from '~/widgets/home-shell/ui/HomeShell';
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

interface HomeLibraryWidgetProps {
  contentTypes?: VideoTaxonomyItem[];
  genres?: VideoTaxonomyItem[];
  videos: HomeLibraryVideo[];
  initialFilters?: Partial<HomeLibraryFilters>;
}

export function HomeLibraryWidget({
  contentTypes = [],
  genres = [],
  videos,
  initialFilters,
}: HomeLibraryWidgetProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
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

  return (
    <HomeShell
      activeFilterCount={activeFilterCount}
      onOpenFilters={() => setIsFiltersOpen(true)}
      onSearchChange={handleSearchChange}
      searchQuery={view.searchFilters.query}
    >
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="mb-2 text-2xl font-bold">My Library</h1>
          <p className="text-muted-foreground">
            Total {view.totalVideosCount} videos • Showing {view.videos.length}
          </p>
        </div>

        <HomeAppliedFiltersBar
          contentTypes={contentTypes}
          filters={view.searchFilters}
          genres={genres}
          onChange={applyFilters}
          onClearAll={handleClearAllFilters}
        />

        <div className="mt-6">
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
                      key={video.id}
                      onQuickView={view.handleQuickView}
                      onTagClick={handleTagToggle}
                      video={video}
                    />
                  ))}
                </div>
              )}
        </div>
      </div>

      <HomeQuickViewDialog
        contentTypes={contentTypes}
        genres={genres}
        modalState={view.modalState}
        onChangeVisibility={view.handleChangeVisibility}
        onClose={view.handleCloseModal}
        onDeleteVideo={view.handleDeleteVideo}
        onTagClick={handleTagToggle}
        onUpdateVideo={view.handleUpdateVideo}
      />
      <HomeFilterSurface
        contentTypes={contentTypes}
        filters={view.searchFilters}
        genres={genres}
        onFiltersChange={applyFilters}
        onOpenChange={setIsFiltersOpen}
        open={isFiltersOpen}
      />
    </HomeShell>
  );
}

import { Button } from '~/shared/ui/button';
import { Separator } from '~/shared/ui/separator';
import type { PlayerSurfaceRelatedVideoItem } from '../model/usePlayerSurfaceView';
import { PlayerRelatedVideoItem } from './PlayerRelatedVideoItem';

interface PlayerRelatedVideosProps {
  activeTag: string | null;
  emptyMessage: string;
  hasTagFilter: boolean;
  onClearTagFilter: () => void;
  onTagClick: (tag: string) => void;
  videos: PlayerSurfaceRelatedVideoItem[];
}

export function PlayerRelatedVideos({
  activeTag,
  emptyMessage,
  hasTagFilter,
  onClearTagFilter,
  onTagClick,
  videos,
}: PlayerRelatedVideosProps) {
  return (
    <aside aria-label="Related videos" className="flex min-w-0 flex-col gap-3 lg:gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold lg:text-lg">Related videos</h2>
          {activeTag ? (
            <p className="text-sm text-muted-foreground">Filtered by #{activeTag}</p>
          ) : null}
        </div>
        {hasTagFilter ? (
          <Button
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onClearTagFilter}
            size="sm"
            variant="ghost"
          >
            Clear filter
          </Button>
        ) : null}
      </div>

      {videos.length > 0 ? (
        <>
          <Separator />
          <div className="flex flex-col gap-3 lg:gap-4">
            {videos.map(video => (
              <PlayerRelatedVideoItem
                activeTag={activeTag}
                key={video.id}
                onTagClick={onTagClick}
                video={video}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="py-6 text-center md:py-8">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      )}
    </aside>
  );
}

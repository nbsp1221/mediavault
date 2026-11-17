import type { MouseEvent } from 'react';
import { Clock3, Play } from 'lucide-react';
import { Link } from 'react-router';
import type { PlayerSurfaceRelatedVideoItem } from '~/pages/player/model/usePlayerSurfaceView';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { AspectRatio } from '~/shared/ui/aspect-ratio';
import { Badge } from '~/shared/ui/badge';

interface PlayerRelatedVideoItemProps {
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  video: PlayerSurfaceRelatedVideoItem;
}

export function PlayerRelatedVideoItem({
  activeTag,
  onTagClick,
  video,
}: PlayerRelatedVideoItemProps) {
  const handleTagClick = (tag: string, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onTagClick(tag);
  };

  return (
    <article className="group relative">
      <Link className="mb-2 block" to={`/player/${video.id}`}>
        <div className="flex gap-2 lg:gap-3">
          <div className="w-32 shrink-0 lg:w-40">
            <AspectRatio ratio={16 / 9}>
              <div className="relative h-full overflow-hidden rounded-md bg-muted">
                {video.thumbnailUrl ? (
                  <img
                    alt={video.title}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                    src={video.thumbnailUrl}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    No preview
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="flex size-8 items-center justify-center rounded-full bg-white/90 text-black">
                    <Play className="size-3 fill-current" />
                  </div>
                </div>

                <div className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1 py-0.5 text-xs text-white">
                  <Clock3 className="size-3" />
                  {video.durationLabel}
                </div>
              </div>
            </AspectRatio>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1 lg:gap-2">
            <h3 className="line-clamp-2 text-xs font-medium leading-tight transition-colors group-hover:text-primary lg:text-sm">
              {video.title}
            </h3>
            <p className="text-xs text-muted-foreground">{formatDisplayDate(video.createdAt)}</p>
          </div>
        </div>
      </Link>

      <div className="flex flex-wrap gap-1">
        {video.visibleTags.map((tag) => (
          <Badge
            asChild
            className="cursor-pointer transition-colors"
            key={tag}
            variant={activeTag?.toLowerCase() === tag.toLowerCase() ? 'default' : 'secondary'}
          >
            <button onClick={(event) => handleTagClick(tag, event)} type="button">
              #{tag}
            </button>
          </Badge>
        ))}
        {video.tags.length > video.visibleTags.length ? (
          <Badge variant="outline">+{video.tags.length - video.visibleTags.length}</Badge>
        ) : null}
      </div>
    </article>
  );
}

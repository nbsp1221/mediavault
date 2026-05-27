import { Clock, Eye, Lock, MoreVertical, Play } from 'lucide-react';
import { Link } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import { formatVideoTagLabel } from '~/modules/library/domain/video-tag';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';
import { AspectRatio } from '~/shared/ui/aspect-ratio';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu';

interface LibraryVideoCardProps {
  video: HomeLibraryVideo;
  onQuickView?: (video: HomeLibraryVideo) => void;
  onTagClick?: (tag: string) => void;
}

export function LibraryVideoCard({ video, onQuickView, onTagClick }: LibraryVideoCardProps) {
  const handleTagClick = (tag: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onTagClick?.(tag);
  };

  const handleQuickView = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onQuickView?.(video);
  };

  const handleQuickViewMenuSelect = () => {
    onQuickView?.(video);
  };

  const hasActions = Boolean(onQuickView);

  return (
    <div className="group relative">
      <Link to={`/player/${video.id}`} className="block">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg bg-muted">
            <AspectRatio ratio={16 / 9}>
              <img
                src={video.thumbnailUrl}
                alt={video.title}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />

              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black">
                  <Play className="h-5 w-5 fill-current" />
                </div>
              </div>

              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white">
                <Clock className="h-3 w-3" />
                {formatDuration(video.duration)}
              </div>

              {video.isPrivate && (
                <Badge
                  className="absolute top-2 left-2 gap-1 bg-black/80 text-white hover:bg-black/80"
                  aria-label="Private video"
                >
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              )}
            </AspectRatio>
          </div>

          <div className="space-y-2">
            <h3 className="line-clamp-2 font-semibold leading-tight transition-colors group-hover:text-primary">
              {video.title}
            </h3>

            <p className="text-xs text-muted-foreground">
              {formatDisplayDate(video.createdAt)}
            </p>
          </div>
        </div>
      </Link>

      {hasActions && (
        <div className="pointer-events-none absolute top-2 right-2 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Open actions menu"
                className="pointer-events-auto h-8 w-8 rounded-full border-0 bg-black/60 p-0 text-white hover:bg-black/80"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={handleQuickViewMenuSelect}>
                <Eye className="mr-2 h-4 w-4" />
                Quick view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {video.tags.slice(0, 3).map(tag => (
          <Badge
            asChild
            key={tag}
            variant="secondary"
          >
            <button
              type="button"
              className="h-5 cursor-pointer px-2 text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
              onClick={event => handleTagClick(tag, event)}
            >
              #{formatVideoTagLabel(tag)}
            </button>
          </Badge>
        ))}
        {video.tags.length > 3 && (
          <Badge
            asChild
            variant="outline"
          >
            <button
              type="button"
              className="h-5 cursor-pointer px-2 text-xs transition-colors hover:bg-muted"
              onClick={handleQuickView}
            >
              +{video.tags.length - 3}
            </button>
          </Badge>
        )}
      </div>
    </div>
  );
}

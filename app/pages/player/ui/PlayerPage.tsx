import type { PlaybackCatalogVideo } from '~/modules/playback/application/ports/video-catalog.port';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';
import { PlayerSurface } from '~/widgets/player-surface/ui/PlayerSurface';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface PlayerPageProps {
  relatedVideos: PlaybackCatalogVideo[];
  video: PlaybackCatalogVideo;
}

export function PlayerPage({ video, relatedVideos }: PlayerPageProps) {
  const description = `${formatDuration(video.duration)} • Added ${formatDisplayDate(video.createdAt)}`;

  return (
    <ProductShell
      activeRoute="videos"
      contentWidth="full"
      description={description}
      title={video.title}
    >
      <PlayerSurface
        relatedVideos={relatedVideos}
        video={video}
      />
    </ProductShell>
  );
}

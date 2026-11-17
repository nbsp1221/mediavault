import type { PlayerVideo } from '~/pages/player/model/player-video';
import type { PlayerPlaylistContext } from '~/pages/player/model/usePlaylistPlayback';
import { PlayerSurface } from '~/pages/player/ui/PlayerSurface';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface PlayerPageProps {
  playlist?: PlayerPlaylistContext | null;
  relatedVideos: PlayerVideo[];
  video: PlayerVideo;
}

export function PlayerPage({ playlist, video, relatedVideos }: PlayerPageProps) {
  const description = `${formatDuration(video.duration)} • Added ${formatDisplayDate(video.createdAt)}`;

  return (
    <ProductShell
      activeRoute="videos"
      contentWidth="full"
      description={description}
      title={video.title}
    >
      <PlayerSurface playlist={playlist} relatedVideos={relatedVideos} video={video} />
    </ProductShell>
  );
}

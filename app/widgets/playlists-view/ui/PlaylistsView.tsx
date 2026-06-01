import type { Playlist } from '~/entities/playlist/model/playlist';
import { PlaylistGrid } from './PlaylistGrid';

interface PlaylistsViewProps {
  playlists: Playlist[];
  videoCountMap: Map<string, number>;
  onCreateNew: () => void;
  onPlaylistClick: (playlist: Playlist) => void;
  onPlaylistPlay: (playlist: Playlist) => void;
  total: number;
}

export function PlaylistsView({
  playlists,
  videoCountMap,
  onCreateNew,
  onPlaylistClick,
  onPlaylistPlay,
  total,
}: PlaylistsViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div>
          <h2 className="text-lg font-semibold">My Playlists</h2>
          <p className="text-muted-foreground">
            {total === 0 ? (
              'No playlists yet'
            ) : (
              `${playlists.length} playlist${playlists.length !== 1 ? 's' : ''}`
            )}
          </p>
        </div>
      </div>

      <PlaylistGrid
        playlists={playlists}
        videoCountMap={videoCountMap}
        isLoading={false}
        onPlay={onPlaylistPlay}
        onClick={onPlaylistClick}
        onCreateNew={onCreateNew}
      />
    </div>
  );
}

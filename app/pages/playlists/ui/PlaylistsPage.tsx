import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { Playlist } from '~/entities/playlist/model/playlist';
import { CreatePlaylistDialog } from '~/features/playlist-create/ui/CreatePlaylistDialog';
import { PlaylistSearchField } from '~/features/playlist-search/ui/PlaylistSearchField';
import { Button } from '~/shared/ui/button';
import { usePlaylistsView } from '~/widgets/playlists-view/model/usePlaylistsView';
import { PlaylistsView } from '~/widgets/playlists-view/ui/PlaylistsView';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface PlaylistsPageProps {
  playlists: Playlist[];
  videoCountMap: Record<string, number>;
  total: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function PlaylistsPage({
  playlists,
  videoCountMap,
  total,
  searchQuery,
  onSearchChange,
}: PlaylistsPageProps) {
  const navigate = useNavigate();
  const {
    isCreateDialogOpen,
    videoCountMapData,
    handlePlaylistPlay,
    handlePlaylistClick,
    handleCreatePlaylist,
    handleCreateDialogChange,
  } = usePlaylistsView({ videoCountMap });
  const handleSearchChange = (query: string) => {
    onSearchChange(query);
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    const nextSearch = params.toString();
    navigate(nextSearch ? `/playlists?${nextSearch}` : '/playlists');
  };

  return (
    <ProductShell
      actions={(
        <Button onClick={handleCreatePlaylist} size="sm">
          <Plus data-icon="inline-start" />
          New Playlist
        </Button>
      )}
      activeRoute="playlists"
      contentWidth="wide"
      headerMode="browse"
      title="Playlists"
      toolbar={(
        <div className="w-full md:max-w-xl">
          <PlaylistSearchField
            ariaLabel="Search playlists"
            onChange={handleSearchChange}
            value={searchQuery}
          />
        </div>
      )}
    >
      <PlaylistsView
        playlists={playlists}
        videoCountMap={videoCountMapData}
        onCreateNew={handleCreatePlaylist}
        onPlaylistClick={handlePlaylistClick}
        onPlaylistPlay={handlePlaylistPlay}
        total={total}
      />
      <CreatePlaylistDialog
        open={isCreateDialogOpen}
        onOpenChange={handleCreateDialogChange}
      />
    </ProductShell>
  );
}

import type { PlaylistStats, PlaylistWithVideos } from '~/entities/playlist/model/playlist';
import { PlaylistDetailView } from '~/widgets/playlist-detail-view/ui/PlaylistDetailView';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface PlaylistDetailPageProps {
  playlist: PlaylistWithVideos;
  stats: PlaylistStats | null;
  relatedPlaylists: Array<{
    id: string;
    name: string;
    type: string;
    videoCount: number;
    relationship: 'parent' | 'child' | 'sibling';
  }>;
  videoPagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } | null;
  permissions: {
    canEdit: boolean;
    canDelete: boolean;
    canAddVideos: boolean;
    canShare: boolean;
  };
}

export function PlaylistDetailPage({
  playlist,
  stats,
  relatedPlaylists,
  videoPagination,
  permissions,
}: PlaylistDetailPageProps) {
  return (
    <ProductShell
      activeRoute="playlists"
      contentWidth="wide"
      description={playlist.name}
      title="Playlist details"
    >
      <PlaylistDetailView
        playlist={playlist}
        stats={stats}
        relatedPlaylists={relatedPlaylists}
        videoPagination={videoPagination}
        permissions={permissions}
      />
    </ProductShell>
  );
}

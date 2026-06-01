import { Globe2, Lock, Play, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { PlaylistWithVideos } from '~/entities/playlist/model/playlist';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Card, CardContent } from '~/shared/ui/card';
import { Separator } from '~/shared/ui/separator';

interface RelatedPlaylistSummary {
  id: string;
  name: string;
  type: string;
  videoCount: number;
  relationship: 'parent' | 'child' | 'sibling';
}

interface PlaylistSummaryItem {
  label: string;
  value: string;
}

interface PlaylistInfoPanelProps {
  playlist: PlaylistWithVideos;
  summaryItems: PlaylistSummaryItem[];
  formattedDates: {
    createdAt: string;
    updatedAt: string;
  };
  totalDurationLabel: string;
  genreLabels: string[];
  relatedPlaylists: RelatedPlaylistSummary[];
  permissions: {
    canEdit: boolean;
  };
  onPlayAll: () => void;
  onEditDetails: () => void;
}

export function PlaylistInfoPanel({
  playlist,
  summaryItems,
  formattedDates,
  totalDurationLabel,
  genreLabels,
  relatedPlaylists,
  permissions,
  onPlayAll,
  onEditDetails,
}: PlaylistInfoPanelProps) {
  const visibilityBadge = playlist.isPublic
    ? (
        <Badge variant="outline" className="flex items-center gap-1">
          <Globe2 className="h-3.5 w-3.5" />
          {' '}
          Public
        </Badge>
      )
    : (
        <Badge variant="outline" className="flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" />
          {' '}
          Private
        </Badge>
      );

  const quickStats = [
    {
      label: 'Videos',
      value: summaryItems.find(item => item.label === 'Videos')?.value ?? '0',
    },
    {
      label: 'Total Duration',
      value: totalDurationLabel,
    },
    {
      label: 'Last Updated',
      value: formattedDates.updatedAt,
    },
  ];

  const additionalDetails = summaryItems.filter(item => !['Videos'].includes(item.label));
  const ownerLabel = playlist.ownerId.length > 16
    ? `${playlist.ownerId.slice(0, 6)}…${playlist.ownerId.slice(-4)}`
    : playlist.ownerId;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-sm">
      <div className="relative overflow-hidden bg-card">
        {playlist.thumbnailUrl && (
          <img
            src={playlist.thumbnailUrl}
            alt={`${playlist.name} artwork`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-card/85" />

        <div className="relative flex flex-col justify-end gap-3 px-6 pt-6 pb-7">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Badge variant="secondary" className="rounded-full bg-background/70">
              {playlist.type.replace('_', ' ')}
            </Badge>
            {visibilityBadge}
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold leading-tight tracking-normal">
              {playlist.name}
            </h2>
            {playlist.description && (
              <p className="max-w-xl text-sm text-muted-foreground">
                {playlist.description}
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={onPlayAll} className="gap-2 rounded-full px-5 py-2">
              <Play className="h-4 w-4" />
              Play All
            </Button>
            {permissions.canEdit && (
              <Button
                variant="outline"
                className="gap-2 rounded-full border-border/80 bg-background/70 backdrop-blur"
                onClick={onEditDetails}
              >
                Edit details
              </Button>
            )}
          </div>
        </div>
      </div>

      <CardContent className="space-y-8 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickStats.map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl border border-border/50 bg-card/60 p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        {additionalDetails.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">At a glance</h3>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {additionalDetails.map(item => (
                <div key={item.label} className="rounded-xl border border-border/40 bg-card/50 p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {genreLabels.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Genres</h3>
            <div className="flex flex-wrap gap-2">
              {genreLabels.map(genre => (
                <Badge key={genre} variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {relatedPlaylists.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">Related playlists</h3>
            <div className="space-y-2">
              {relatedPlaylists.map(related => (
                <Link
                  key={related.id}
                  to={`/playlists/${related.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/40 p-3 transition hover:border-primary/50 hover:bg-card"
                >
                  <div>
                    <p className="font-medium leading-tight">{related.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {related.relationship} • {related.videoCount} videos
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {related.type.replace('_', ' ')}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/60 p-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Sharing</h3>
          <p className="text-sm text-muted-foreground">
            Private to you. Add videos from the library page, where each video card lets you send it to this playlist. Invite-only sharing will be available soon.
          </p>
        </div>

        <Separator />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Owned by {ownerLabel}</p>
            <p>Created {formattedDates.createdAt}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

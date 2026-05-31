import { ArrowLeft, Clock, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { changeLibraryVideoVisibility, deleteLibraryVideo, updateLibraryVideoMetadata } from '~/features/home-library-video-actions/model/useHomeLibraryVideoActions';
import { DeleteVideoConfirmDialog } from '~/features/video-delete/ui/DeleteVideoConfirmDialog';
import { type VideoMetadataFormValues, VideoMetadataForm } from '~/features/video-metadata/ui/VideoMetadataForm';
import { VideoVisibilitySection } from '~/features/video-visibility/ui/VideoVisibilitySection';
import { formatDisplayDate } from '~/shared/lib/format-display-date';
import { formatDuration } from '~/shared/lib/format-duration';
import { AspectRatio } from '~/shared/ui/aspect-ratio';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { Separator } from '~/shared/ui/separator';
import { useUnsavedChangesGuard } from '../model/useUnsavedChangesGuard';

interface VideoDetailsViewProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  redirectTo: string;
  video: HomeLibraryVideo;
}

export function VideoDetailsView({
  contentTypes,
  genres,
  redirectTo,
  video: initialVideo,
}: VideoDetailsViewProps) {
  const navigate = useNavigate();
  const [video, setVideo] = useState(initialVideo);
  const [isMetadataDirty, setIsMetadataDirty] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isChangingVisibility, setIsChangingVisibility] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isNavigationConfirmed, setIsNavigationConfirmed] = useState(false);
  const [pendingConfirmedNavigation, setPendingConfirmedNavigation] = useState<string | null>(null);
  const lastConfirmedNavigationTarget = useRef<string | null>(null);
  const unsavedGuard = useUnsavedChangesGuard(isMetadataDirty && !isNavigationConfirmed);
  const canEditMetadata = video.permissions.canEdit;
  const canManageVisibility = video.permissions.canManageVisibility;
  const canDeleteVideo = video.permissions.canDelete;

  useEffect(() => {
    if (!pendingConfirmedNavigation) {
      return;
    }

    if (lastConfirmedNavigationTarget.current === pendingConfirmedNavigation) {
      return;
    }

    lastConfirmedNavigationTarget.current = pendingConfirmedNavigation;
    void navigate(pendingConfirmedNavigation);
  }, [navigate, pendingConfirmedNavigation]);

  const handleMetadataSave = async (values: VideoMetadataFormValues) => {
    setMetadataError(null);

    try {
      const updatedVideo = await updateLibraryVideoMetadata(video, values);
      setVideo(updatedVideo);
      setIsMetadataDirty(false);
      toast.success('Video details saved.');
    }
    catch (error) {
      setMetadataError(error instanceof Error ? error.message : 'Failed to update video');
    }
  };

  const handleVisibilityChange = async (visibility: VideoVisibility) => {
    setIsChangingVisibility(true);

    try {
      const updatedVideo = await changeLibraryVideoVisibility(video, visibility);
      setVideo(updatedVideo);
    }
    finally {
      setIsChangingVisibility(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteLibraryVideo(video);
      flushSync(() => {
        setIsNavigationConfirmed(true);
        setIsMetadataDirty(false);
        setDeleteDialogOpen(false);
        setPendingConfirmedNavigation(redirectTo);
      });
    }
    catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete video');
    }
    finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = useCallback(() => {
    void navigate(redirectTo);
  }, [navigate, redirectTo]);

  return (
    <main className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="-ml-3 min-h-11">
            <Link to={redirectTo}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to library
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">Video details</h1>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <aside className="space-y-4">
          <div className="overflow-hidden rounded-md border bg-muted">
            <AspectRatio ratio={16 / 9}>
              {video.thumbnailUrl
                ? (
                    <img
                      alt={video.title}
                      className="h-full w-full object-cover"
                      src={video.thumbnailUrl}
                    />
                  )
                : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                      No thumbnail
                    </div>
                  )}
            </AspectRatio>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{video.title}</h2>
              {video.isPrivate && (
                <Badge variant="secondary">Private</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(video.duration)}
              </span>
              <span>{formatDisplayDate(video.createdAt)}</span>
            </div>
            <Button asChild className="min-h-11" variant="outline">
              <Link to={`/player/${video.id}`}>
                <Play className="mr-2 h-4 w-4" />
                Watch video
              </Link>
            </Button>
          </div>
        </aside>

        <div className="space-y-8">
          {canEditMetadata && (
            <VideoMetadataForm
              contentTypes={contentTypes}
              error={metadataError}
              genres={genres}
              onCancel={handleCancel}
              onDirtyChange={setIsMetadataDirty}
              onSave={handleMetadataSave}
              video={video}
            />
          )}

          {canEditMetadata && canManageVisibility && <Separator />}

          {canManageVisibility && (
            <VideoVisibilitySection
              isChanging={isChangingVisibility}
              onChangeVisibility={handleVisibilityChange}
              video={video}
            />
          )}

          {canDeleteVideo && (
            <>
              {(canEditMetadata || canManageVisibility) && <Separator />}
              <section className="space-y-3 rounded-md border border-destructive/30 p-4" aria-labelledby="danger-zone-heading">
                <div>
                  <h2 id="danger-zone-heading" className="text-base font-semibold text-destructive">
                    Danger zone
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete this video from your library. This action cannot be undone.
                  </p>
                </div>
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteDialogOpen(true);
                  }}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </section>
            </>
          )}
        </div>
      </div>

      <DeleteVideoConfirmDialog
        error={deleteError}
        isDeleting={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteDialogOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
        open={deleteDialogOpen}
        videoTitle={video.title}
      />

      <Dialog open={unsavedGuard.isBlocked}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Your metadata changes have not been saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="min-h-11" onClick={unsavedGuard.reset} type="button" variant="outline">
              Stay
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                const blockedLocation = unsavedGuard.location;
                const target = blockedLocation
                  ? `${blockedLocation.pathname}${blockedLocation.search}${blockedLocation.hash}`
                  : redirectTo;

                flushSync(() => {
                  setIsNavigationConfirmed(true);
                  setIsMetadataDirty(false);
                  setPendingConfirmedNavigation(target);
                });
                unsavedGuard.reset();
              }}
              type="button"
              variant="destructive"
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

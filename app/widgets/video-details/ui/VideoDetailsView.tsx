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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/shared/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';
import { useUnsavedChangesGuard } from '../model/useUnsavedChangesGuard';

interface VideoDetailsViewProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
  metadataFormId?: string;
  onMetadataSubmittingChange?: (isSubmitting: boolean) => void;
  redirectTo: string;
  renderMetadataActions?: boolean;
  showPageHeader?: boolean;
  video: HomeLibraryVideo;
}

export function VideoDetailsView({
  contentTypes,
  genres,
  metadataFormId,
  onMetadataSubmittingChange,
  redirectTo,
  renderMetadataActions = true,
  showPageHeader = true,
  video: initialVideo,
}: VideoDetailsViewProps) {
  const navigate = useNavigate();
  const [video, setVideo] = useState(initialVideo);
  const [metadataFormVideo, setMetadataFormVideo] = useState(initialVideo);
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
      setMetadataFormVideo(updatedVideo);
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
    <div className={showPageHeader ? 'container mx-auto px-4 py-6 sm:px-6 lg:px-8' : 'w-full'}>
      {showPageHeader && (
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
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <aside className="flex flex-col gap-4 lg:col-span-7">
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

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{video.title}</h2>
              <Badge variant="secondary">
                {video.isPrivate ? 'Private' : 'Public'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDuration(video.duration)}
              </span>
              <span>{formatDisplayDate(video.createdAt)}</span>
            </div>
            {video.description ? (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold">About this video</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {video.description}
                </p>
              </div>
            ) : null}
            <Button asChild variant="outline">
              <Link to={`/player/${video.id}`}>
                <Play data-icon="inline-start" />
                Watch video
              </Link>
            </Button>
          </div>
        </aside>

        <div className="flex flex-col gap-6 lg:col-span-5">
          {canEditMetadata && (
            <VideoMetadataForm
              contentTypes={contentTypes}
              error={metadataError}
              formId={metadataFormId}
              genres={genres}
              onCancel={handleCancel}
              onDirtyChange={setIsMetadataDirty}
              onSubmittingChange={onMetadataSubmittingChange}
              onSave={handleMetadataSave}
              renderActions={renderMetadataActions}
              video={metadataFormVideo}
            />
          )}

          {canManageVisibility && (
            <VideoVisibilitySection
              isChanging={isChangingVisibility}
              onChangeVisibility={handleVisibilityChange}
              video={video}
            />
          )}

          {canDeleteVideo && (
            <section aria-labelledby="danger-zone-heading">
              <Card className="border-destructive/30">
                <CardHeader>
                  <CardTitle id="danger-zone-heading" className="text-base text-destructive">
                    Danger zone
                  </CardTitle>
                  <CardDescription>
                    Delete this video from your library. This action cannot be undone.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteDialogOpen(true);
                    }}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            </section>
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
    </div>
  );
}

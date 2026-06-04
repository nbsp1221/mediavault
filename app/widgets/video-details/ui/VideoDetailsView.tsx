import { ArrowLeft, CalendarDays, Clock, Play, Tag, Trash2 } from 'lucide-react';
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
import { Separator } from '~/shared/ui/separator';
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
  const contentTypeLabel = contentTypes.find(item => item.slug === video.contentTypeSlug)?.label;
  const genreLabelLookup = new Map(genres.map(genre => [genre.slug, genre.label]));
  const genreLabels = (video.genreSlugs ?? [])
    .map(genreSlug => genreLabelLookup.get(genreSlug))
    .filter((genreLabel): genreLabel is string => Boolean(genreLabel));

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

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-12 lg:gap-8">
        <aside aria-label="Video summary" className="flex flex-col gap-6 lg:col-span-7">
          <div className="group overflow-hidden rounded-xl border border-border bg-black shadow-sm">
            <AspectRatio ratio={16 / 9} className="relative">
              {video.thumbnailUrl
                ? (
                    <img
                      alt={video.title}
                      className="h-full w-full object-cover"
                      src={video.thumbnailUrl}
                    />
                  )
                : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      No thumbnail
                    </div>
                  )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/25">
                <Button
                  asChild
                  size="icon-lg"
                  variant="secondary"
                  className="size-16 rounded-full border border-white/20 bg-background/60 text-foreground shadow-xl backdrop-blur-sm hover:bg-background/75"
                >
                  <Link aria-label="Watch video" to={`/player/${video.id}`}>
                    <Play className="size-7 fill-current" />
                  </Link>
                </Button>
              </div>
              <div className="absolute right-3 bottom-3 rounded-md bg-background/70 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                {formatDuration(video.duration)}
              </div>
            </AspectRatio>
          </div>

          <div className="flex flex-col gap-4 lg:gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="min-w-0 text-xl font-semibold leading-tight md:text-2xl">{video.title}</h2>
              <Badge variant="secondary" className="h-6 rounded-md px-2 text-xs font-medium">
                {video.isPrivate ? 'Private' : 'Public'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground lg:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />
                {formatDuration(video.duration)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {formatDisplayDate(video.createdAt)}
              </span>
              {canEditMetadata && contentTypeLabel ? (
                <span>
                  {contentTypeLabel}
                </span>
              ) : null}
              {canEditMetadata && genreLabels.map(genreLabel => (
                <span key={genreLabel}>
                  {genreLabel}
                </span>
              ))}
            </div>

            {canEditMetadata && video.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {video.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs font-medium">
                    <Tag className="size-3" />
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}

            {video.description ? (
              <div className="space-y-3">
                <Separator />
                <h3 className="text-sm font-semibold">About this video</h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {video.description}
                </p>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-5">
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
              <Card className="gap-0 rounded-xl border-destructive/20 bg-destructive/5 py-0 shadow-none">
                <CardHeader className="px-4 pt-4 pb-0 lg:px-5 lg:pt-5">
                  <CardTitle id="danger-zone-heading" className="text-sm text-destructive">
                    Danger zone
                  </CardTitle>
                  <CardDescription className="mt-2 text-xs leading-5">
                    Delete this video from your library. This action cannot be undone.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pt-4 pb-4 lg:px-5 lg:pb-5">
                  <Button
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteDialogOpen(true);
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete video
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

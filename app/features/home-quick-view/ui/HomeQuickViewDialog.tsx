import { type LucideIcon, Clock, Edit, Eye, EyeOff, Play, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { formatVideoTagLabel } from '~/modules/library/domain/video-tag';
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
import { EditHomeVideoForm } from './EditHomeVideoForm';

export interface HomeLibraryModalState {
  video: HomeLibraryVideo | null;
  isOpen: boolean;
}

interface UpdateVideoPayload {
  contentTypeSlug?: string | null;
  title: string;
  tags: string[];
  genreSlugs: string[];
  description?: string;
}

type VisibilityFeedback = {
  message: string;
  type: 'error' | 'success';
};

const visibilitySuccessMessages: Record<VideoVisibility, string> = {
  private: 'Visibility updated to Private.',
  public: 'Visibility updated to Public.',
};

function getVisibilityAction(isPrivate: boolean): {
  currentLabel: 'Private' | 'Public';
  Icon: LucideIcon;
  label: 'Make Private' | 'Make Public';
  nextVisibility: VideoVisibility;
} {
  return isPrivate
    ? {
        currentLabel: 'Private',
        Icon: Eye,
        label: 'Make Public',
        nextVisibility: 'public',
      }
    : {
        currentLabel: 'Public',
        Icon: EyeOff,
        label: 'Make Private',
        nextVisibility: 'private',
      };
}

function VisibilityFeedbackMessage({ feedback }: { feedback: VisibilityFeedback }) {
  const isError = feedback.type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={isError
        ? 'mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        : 'mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700'}
    >
      {feedback.message}
    </div>
  );
}

interface HomeQuickViewDialogProps {
  contentTypes?: VideoTaxonomyItem[];
  genres?: VideoTaxonomyItem[];
  modalState: HomeLibraryModalState;
  isOpen?: boolean;
  onClose: () => void;
  onTagClick: (tag: string) => void;
  onChangeVisibility: (video: HomeLibraryVideo, visibility: VideoVisibility) => Promise<void>;
  onDeleteVideo: (video: HomeLibraryVideo) => Promise<void>;
  onUpdateVideo: (video: HomeLibraryVideo, updates: UpdateVideoPayload) => Promise<void>;
}

export function HomeQuickViewDialog({
  contentTypes = [],
  genres = [],
  modalState,
  isOpen,
  onClose,
  onChangeVisibility,
  onDeleteVideo,
  onTagClick,
  onUpdateVideo,
}: HomeQuickViewDialogProps) {
  const video = modalState.video;
  const open = isOpen ?? modalState.isOpen;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublicConfirm, setShowPublicConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isChangingVisibility, setIsChangingVisibility] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [visibilityFeedback, setVisibilityFeedback] = useState<VisibilityFeedback | null>(null);

  if (!video) {
    return null;
  }

  const canDelete = video.permissions.canDelete;
  const canEdit = video.permissions.canEdit;
  const canManageVisibility = video.permissions.canManageVisibility;
  const effectiveEditMode = isEditMode && canEdit;
  const visibilityAction = getVisibilityAction(video.isPrivate);
  const VisibilityActionIcon = visibilityAction.Icon;

  const clearActionErrors = () => {
    setDeleteError(null);
    setEditError(null);
    setVisibilityFeedback(null);
  };

  const handleTagClick = (tag: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onTagClick(tag);
    onClose();
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onDeleteVideo(video);
      setShowDeleteConfirm(false);
      setDeleteError(null);
      onClose();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete video';
      console.error('Failed to delete video:', error);
      setDeleteError(message);
    }
    finally {
      setIsDeleting(false);
    }
  };

  const handleEditSave = async (data: UpdateVideoPayload) => {
    setEditError(null);

    try {
      await onUpdateVideo(video, data);
      setEditError(null);
      setIsEditMode(false);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update video';
      console.error('Failed to update video:', error);
      setEditError(message);
    }
  };

  const executeVisibilityChange = async (visibility: VideoVisibility) => {
    setIsChangingVisibility(true);
    setVisibilityFeedback(null);

    try {
      await onChangeVisibility(video, visibility);
      setShowPublicConfirm(false);
      setVisibilityFeedback({
        message: visibilitySuccessMessages[visibility],
        type: 'success',
      });
    }
    catch (error) {
      console.error('Failed to update visibility:', error);
      setVisibilityFeedback({
        message: 'Visibility could not be updated. Try again.',
        type: 'error',
      });
    }
    finally {
      setIsChangingVisibility(false);
    }
  };

  const handleVisibilityAction = () => {
    if (visibilityAction.nextVisibility === 'public') {
      setVisibilityFeedback(null);
      setShowPublicConfirm(true);
      return;
    }

    void executeVisibilityChange('private');
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsEditMode(false);
            setShowDeleteConfirm(false);
            setShowPublicConfirm(false);
            clearActionErrors();
            onClose();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <div className="space-y-3">
              <DialogTitle className="pr-8 text-lg font-semibold line-clamp-2">
                {effectiveEditMode ? 'Edit Video Information' : video.title}
              </DialogTitle>
              {!effectiveEditMode && canEdit && (
                <div className="flex justify-start">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditError(null);
                      setIsEditMode(true);
                    }}
                    type="button"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Info
                  </Button>
                </div>
              )}
            </div>
            <DialogDescription className="sr-only">
              {`${video.title} video information and playback options`}
            </DialogDescription>
          </DialogHeader>

          {effectiveEditMode
            ? (
                <div className="space-y-4">
                  {editError && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      {editError}
                    </div>
                  )}
                  <EditHomeVideoForm
                    contentTypes={contentTypes}
                    genres={genres}
                    video={video}
                    onSave={handleEditSave}
                    onCancel={() => {
                      setEditError(null);
                      setIsEditMode(false);
                    }}
                  />
                </div>
              )
            : (
                <div className="space-y-6">
                  <div className="relative overflow-hidden rounded-lg bg-muted">
                    <AspectRatio ratio={16 / 9}>
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="h-full w-full object-cover"
                      />

                      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-black/80 px-2 py-1 text-sm text-white">
                        <Clock className="h-3 w-3" />
                        {formatDuration(video.duration)}
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center">
                        <Button asChild size="lg" className="h-16 w-16 rounded-full">
                          <Link to={`/player/${video.id}`} onClick={onClose} aria-label={`Play ${video.title}`}>
                            <Play className="h-6 w-6 fill-current" />
                          </Link>
                        </Button>
                      </div>
                    </AspectRatio>
                  </div>

                  <div className="space-y-4">
                    {video.description && (
                      <div>
                        <h3 className="mb-2 font-medium">Description</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {video.description}
                        </p>
                      </div>
                    )}

                    <div>
                      <h3 className="mb-2 font-medium">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {video.tags.map(tag => (
                          <Badge
                            asChild
                            key={tag}
                            variant="secondary"
                          >
                            <button
                              type="button"
                              className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
                              onClick={event => handleTagClick(tag, event)}
                            >
                              #{formatVideoTagLabel(tag)}
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Duration:</span>
                        <span className="ml-2">{formatDuration(video.duration)}</span>
                      </div>
                      <div>
                        <span className="font-medium">Added:</span>
                        <span className="ml-2">{formatDisplayDate(video.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {canManageVisibility && (
                    <section className="rounded-md border bg-muted/30 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-medium">
                            {`Visibility: ${visibilityAction.currentLabel}`}
                          </h3>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleVisibilityAction}
                          disabled={isChangingVisibility}
                          type="button"
                        >
                          {isChangingVisibility
                            ? 'Updating...'
                            : (
                                <>
                                  <VisibilityActionIcon className="mr-2 h-4 w-4" />
                                  {visibilityAction.label}
                                </>
                              )}
                        </Button>
                      </div>

                      {visibilityFeedback && (
                        <VisibilityFeedbackMessage feedback={visibilityFeedback} />
                      )}
                    </section>
                  )}

                  <div className="flex gap-3 border-t pt-4">
                    <Button asChild className="flex-1" size="default">
                      <Link to={`/player/${video.id}`} onClick={onClose}>
                        <Play className="mr-2 h-4 w-4" />
                        Watch
                      </Link>
                    </Button>

                    {canDelete && (
                      <Button
                        variant="destructive"
                        size="default"
                        onClick={() => {
                          setDeleteError(null);
                          setShowDeleteConfirm(true);
                        }}
                        type="button"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    )}

                    <Button variant="outline" size="default" onClick={onClose} type="button">
                      <X className="mr-2 h-4 w-4" />
                      Close
                    </Button>
                  </div>
                </div>
              )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPublicConfirm}
        onOpenChange={(nextOpen) => {
          setShowPublicConfirm(nextOpen);

          if (!nextOpen) {
            setVisibilityFeedback(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Make video public?</DialogTitle>
            <DialogDescription>
              Anyone who can access this site can find and watch this video. You can make it private again later.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVisibilityFeedback(null);
                setShowPublicConfirm(false);
              }}
              disabled={isChangingVisibility}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void executeVisibilityChange('public')}
              disabled={isChangingVisibility}
              type="button"
            >
              {isChangingVisibility
                ? 'Updating...'
                : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Make Public
                    </>
                  )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(nextOpen) => {
          setShowDeleteConfirm(nextOpen);

          if (!nextOpen) {
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Video</DialogTitle>
            <DialogDescription>
              {`Are you sure you want to delete "${video.title}"?`}
              <br />
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {deleteError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteError(null);
                setShowDeleteConfirm(false);
              }}
              disabled={isDeleting}
              type="button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              type="button"
            >
              {isDeleting
                ? 'Deleting…'
                : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </>
                  )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

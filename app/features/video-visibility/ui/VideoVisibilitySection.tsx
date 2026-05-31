import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';

interface VideoVisibilitySectionProps {
  isChanging?: boolean;
  onChangeVisibility: (visibility: VideoVisibility) => Promise<void>;
  video: HomeLibraryVideo;
}

const visibilitySuccessMessages: Record<VideoVisibility, string> = {
  private: 'Visibility updated to Private.',
  public: 'Visibility updated to Public.',
};

export function VideoVisibilitySection({
  isChanging = false,
  onChangeVisibility,
  video,
}: VideoVisibilitySectionProps) {
  const [showPublicConfirm, setShowPublicConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const currentLabel = video.isPrivate ? 'Private' : 'Public';
  const nextVisibility: VideoVisibility = video.isPrivate ? 'public' : 'private';
  const actionLabel = video.isPrivate ? 'Make Public' : 'Make Private';
  const ActionIcon = video.isPrivate ? Eye : EyeOff;

  if (!video.permissions.canManageVisibility) {
    return null;
  }

  const executeChange = async (visibility: VideoVisibility) => {
    setFeedback(null);

    try {
      await onChangeVisibility(visibility);
      setShowPublicConfirm(false);
      setFeedback({
        message: visibilitySuccessMessages[visibility],
        type: 'success',
      });
    }
    catch {
      setFeedback({
        message: 'Visibility could not be updated. Try again.',
        type: 'error',
      });
    }
  };

  const handleAction = () => {
    if (nextVisibility === 'public') {
      setFeedback(null);
      setShowPublicConfirm(true);
      return;
    }

    void executeChange('private');
  };

  return (
    <section className="space-y-4 rounded-md border bg-muted/20 p-4" aria-labelledby="video-visibility-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 id="video-visibility-heading" className="text-base font-semibold">
            {`Visibility: ${currentLabel}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {video.isPrivate
              ? 'Only you can browse and watch this video.'
              : 'Anyone who can access this site can find and watch this video.'}
          </p>
        </div>
        <Button
          className="min-h-11"
          disabled={isChanging}
          onClick={handleAction}
          type="button"
          variant="outline"
        >
          <ActionIcon className="mr-2 h-4 w-4" />
          {isChanging ? 'Updating...' : actionLabel}
        </Button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={feedback.type === 'error'
            ? 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            : 'rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground'}
        >
          {feedback.message}
        </div>
      )}

      <Dialog
        open={showPublicConfirm}
        onOpenChange={(nextOpen) => {
          setShowPublicConfirm(nextOpen);
          if (!nextOpen) {
            setFeedback(null);
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
            <Button className="min-h-11" disabled={isChanging} onClick={() => setShowPublicConfirm(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="min-h-11" disabled={isChanging} onClick={() => void executeChange('public')} type="button">
              <Eye className="mr-2 h-4 w-4" />
              {isChanging ? 'Updating...' : 'Make Public'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

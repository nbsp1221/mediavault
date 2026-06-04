import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { HomeLibraryVideo } from '~/entities/library-video/model/library-video';
import type { VideoVisibility } from '~/modules/library/domain/value-objects/video-visibility';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/shared/ui/card';

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
    <section aria-labelledby="video-visibility-heading">
      <Card className="gap-0 rounded-xl border-border/70 bg-card/60 py-0 shadow-none">
        <CardHeader className="grid-cols-[1fr_auto] px-4 py-4 lg:px-5 lg:py-5">
          <div className="min-w-0">
            <CardTitle id="video-visibility-heading" className="text-sm">
              Visibility
            </CardTitle>
            <CardDescription className="mt-2 max-w-[16rem] text-xs leading-5">
              {video.isPrivate
                ? 'Only you can browse and watch this video.'
                : 'Anyone with site access can find and watch this video.'}
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant="secondary" className="h-6 gap-1.5 rounded-md px-2 text-xs">
              {video.isPrivate ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {currentLabel}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
          <p className="text-xs text-muted-foreground">
            {`Current visibility: ${currentLabel}`}
          </p>
          <Button
            disabled={isChanging}
            onClick={handleAction}
            size="sm"
            type="button"
            variant="outline"
          >
            <ActionIcon data-icon="inline-start" />
            {isChanging ? 'Updating...' : actionLabel}
          </Button>
        </CardContent>

        {feedback && (
          <CardContent className="px-4 pb-4 lg:px-5">
            {feedback.type === 'error' ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {feedback.message}
                </AlertDescription>
              </Alert>
            ) : (
              <div role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {feedback.message}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={showPublicConfirm}
        onOpenChange={(nextOpen) => {
          if (isChanging) {
            return;
          }
          setShowPublicConfirm(nextOpen);
          if (!nextOpen) {
            setFeedback(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make video public?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who can access this site can find and watch this video. You can make it private again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChanging}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isChanging}
              onClick={(event) => {
                event.preventDefault();
                void executeChange('public');
              }}
            >
              <Eye data-icon="inline-start" />
              {isChanging ? 'Updating...' : 'Make Public'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

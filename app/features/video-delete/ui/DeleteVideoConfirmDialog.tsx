import { Loader2, Trash2 } from 'lucide-react';
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

interface DeleteVideoConfirmDialogProps {
  error?: string | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  videoTitle: string;
}

export function DeleteVideoConfirmDialog({
  error,
  isDeleting,
  onCancel,
  onConfirm,
  open,
  videoTitle,
}: DeleteVideoConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete video?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Delete "${videoTitle}"? This action cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {isDeleting
              ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    Deleting...
                  </>
                )
              : (
                  <>
                    <Trash2 data-icon="inline-start" />
                    Delete video
                  </>
                )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

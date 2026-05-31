import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '~/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/shared/ui/dialog';

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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isDeleting) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete video?</DialogTitle>
          <DialogDescription>
            {`Delete "${videoTitle}"? This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            className="min-h-11"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="min-h-11"
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            {isDeleting
              ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                )
              : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete video
                  </>
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

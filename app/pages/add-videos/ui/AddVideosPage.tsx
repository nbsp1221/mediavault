import { useBeforeUnload, useBlocker } from 'react-router';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { useAddVideosView } from '~/pages/add-videos/model/useAddVideosView';
import { useIngestJobs } from '~/pages/add-videos/model/useIngestJobs';
import { AddVideosView } from '~/pages/add-videos/ui/AddVideosView';
import { IngestJobsList } from '~/pages/add-videos/ui/IngestJobsList';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog';
import { Button } from '~/shared/ui/button';
import { ProductShell } from '~/widgets/product-shell/ui/ProductShell';

interface AddVideosPageProps {
  contentTypes: VideoTaxonomyItem[];
  genres: VideoTaxonomyItem[];
}

export function AddVideosPage({ contentTypes, genres }: AddVideosPageProps) {
  const jobs = useIngestJobs();
  const view = useAddVideosView({ onAccepted: jobs.acceptJob });
  const shouldBlock =
    view.session !== null &&
    view.session.status !== 'submitted' &&
    view.session.status !== 'completed';
  const blocker = useBlocker(shouldBlock);
  useBeforeUnload(
    (event) => {
      if (shouldBlock) {
        event.preventDefault();
      }
    },
    { capture: true },
  );

  return (
    <ProductShell
      activeRoute="upload"
      contentWidth="standard"
      description="Choose a video, review its details, then process it privately in the background."
      title="Upload a video"
    >
      <div className="flex flex-col gap-8">
        <AddVideosView
          canAddToLibrary={view.canAddToLibrary}
          contentTypes={contentTypes}
          genres={genres}
          onAddToLibrary={() => {
            void view.handleAddToLibrary();
          }}
          onChooseFiles={view.handleChooseFiles}
          onClearSession={view.handleClearSession}
          onContentTypeChange={view.handleContentTypeChange}
          onDescriptionChange={view.handleDescriptionChange}
          onGenreSlugsChange={view.handleGenreSlugsChange}
          onRemoveSession={() => {
            void view.handleRemoveSession();
          }}
          onRetryUpload={view.handleRetryUpload}
          onTagsChange={view.handleTagsChange}
          onTitleChange={view.handleTitleChange}
          pageError={view.pageError}
          session={view.session}
          showPageHeader={false}
        />
        <IngestJobsList
          actionError={jobs.actionError}
          isLoading={jobs.isLoading}
          jobs={jobs.jobs}
          onAction={(job, action) => {
            void jobs.control(job, action);
          }}
          onRefresh={jobs.refresh}
          pendingIds={jobs.pendingIds}
          statusError={jobs.statusError}
        />
      </div>
      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') {
            blocker.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              The file transfer and unsubmitted details cannot resume after leaving. Jobs already
              accepted for processing continue safely on the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (blocker.state === 'blocked') {
                  blocker.reset();
                }
              }}
            >
              Stay
            </AlertDialogCancel>
            <Button
              onClick={() => {
                view.handleClearSession();
                if (blocker.state === 'blocked') {
                  blocker.proceed();
                }
              }}
            >
              Leave upload
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProductShell>
  );
}

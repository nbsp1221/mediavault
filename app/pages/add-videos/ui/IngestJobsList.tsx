import { Check, Clock, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router';
import type { IngestJobView } from '~/modules/ingest/domain/ingest-job-view';
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
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/shared/ui/card';
import { Empty, EmptyDescription, EmptyHeader } from '~/shared/ui/empty';
import { Skeleton } from '~/shared/ui/skeleton';

interface Props {
  actionError: string | null;
  isLoading: boolean;
  jobs: IngestJobView[];
  onAction: (job: IngestJobView, action: 'cancel' | 'remove' | 'retry') => void;
  onRefresh: () => void;
  pendingIds: string[];
  statusError: string | null;
}

function phaseLabel(job: IngestJobView): string {
  if (job.state === 'succeeded') {
    return 'Added';
  }
  if (job.state === 'failed') {
    return 'Failed';
  }
  if (job.state === 'cancelled') {
    return 'Cancelled';
  }
  if (job.cancelRequested) {
    return 'Cancelling';
  }
  if (job.state === 'queued') {
    return job.error ? 'Retry scheduled' : 'Queued';
  }
  return {
    queued: 'Queued',
    probing: 'Inspecting video',
    preparing: 'Preparing video',
    packaging: 'Packaging playback',
    thumbnail: 'Protecting thumbnail',
    verifying: 'Verifying media',
    publishing: 'Publishing video',
  }[job.phase];
}

export function IngestJobsList({
  actionError,
  isLoading,
  jobs,
  onAction,
  onRefresh,
  pendingIds,
  statusError,
}: Props) {
  return (
    <section aria-labelledby="processing-jobs-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="processing-jobs-title" className="text-xl font-semibold">
            Processing jobs
          </h2>
          <p className="text-sm text-muted-foreground">
            Accepted jobs continue on the server after you leave. Active jobs appear first.
          </p>
        </div>
        <Button onClick={onRefresh} size="sm" variant="outline">
          <RefreshCw data-icon="inline-start" />
          Refresh status
        </Button>
      </div>
      {statusError && (
        <Alert>
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {isLoading && jobs.length === 0 ? (
        <Skeleton aria-label="Loading processing jobs" className="h-24 w-full" />
      ) : jobs.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              No processing jobs yet. Upload a file and add it to the library to begin.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        jobs.map((job) => {
          const pending = pendingIds.includes(job.id);
          const running = job.state === 'queued' || job.state === 'running';
          return (
            <Card key={job.id} aria-label={`Processing ${job.metadata.title}`}>
              <CardHeader>
                <CardTitle>
                  <h3 className="break-words">{job.metadata.title}</h3>
                </CardTitle>
                <CardDescription className="flex flex-wrap gap-2">
                  <Badge variant={job.state === 'failed' ? 'destructive' : 'secondary'}>
                    {phaseLabel(job)}
                  </Badge>
                  <Badge variant="outline">
                    {job.state === 'succeeded' ? 'Added privately' : 'Private by default'}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {job.state === 'succeeded' ? (
                  <Alert role="status">
                    <Check />
                    <AlertDescription>{`"${job.metadata.title}" has been added to the library.`}</AlertDescription>
                  </Alert>
                ) : job.state === 'cancelled' ? (
                  <p className="text-sm text-muted-foreground">
                    Processing stopped. The staged source remains available until you remove it.
                  </p>
                ) : job.error ? (
                  <Alert variant={job.state === 'failed' ? 'destructive' : 'default'}>
                    <AlertDescription>{job.error.message}</AlertDescription>
                  </Alert>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4 shrink-0" />
                    {job.cancelRequested
                      ? 'Waiting for the media process to stop safely.'
                      : 'You can leave this page and return to check progress.'}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex flex-wrap justify-end gap-2">
                {job.videoId && (
                  <>
                    <Button asChild variant="outline">
                      <Link to={`/videos/${job.videoId}/edit`}>Edit video</Link>
                    </Button>
                    <Button asChild>
                      <Link to={`/player/${job.videoId}`}>Watch video</Link>
                    </Button>
                  </>
                )}
                {running && (
                  <Button
                    disabled={pending || job.cancelRequested}
                    onClick={() => onAction(job, 'cancel')}
                    variant="outline"
                  >
                    <X data-icon="inline-start" />
                    {job.cancelRequested ? 'Cancelling...' : 'Cancel processing'}
                  </Button>
                )}
                {job.canRetry && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={pending} variant="outline">
                          Remove staged file
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this staged upload?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the server-held source and its processing history. The file
                            on your device is unchanged.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep source</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onAction(job, 'remove')}>
                            Remove source
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button disabled={pending} onClick={() => onAction(job, 'retry')}>
                      <RefreshCw data-icon="inline-start" />
                      Retry processing
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          );
        })
      )}
    </section>
  );
}

import { ArrowLeft, Check, FileVideo, RefreshCw, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import { VideoTagInput } from '~/features/video-metadata/ui/VideoTagInput';
import {
  VideoTaxonomyMultiSelect,
  VideoTaxonomySingleSelect,
} from '~/features/video-metadata/ui/VideoTaxonomyCombobox';
import {
  BROWSER_UPLOAD_ACCEPT,
  BROWSER_UPLOAD_MAX_SIZE_LABEL,
  BROWSER_UPLOAD_SUPPORTED_FORMATS_LABEL,
} from '~/shared/lib/upload/browser-upload-contract';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import { Card, CardContent, CardHeader } from '~/shared/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '~/shared/ui/empty';
import { Input } from '~/shared/ui/input';
import { Label } from '~/shared/ui/label';
import { Separator } from '~/shared/ui/separator';
import { Textarea } from '~/shared/ui/textarea';
import type { AddVideosSession } from '../model/useAddVideosView';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface AddVideosViewProps {
  canAddToLibrary: boolean;
  contentTypes?: VideoTaxonomyItem[];
  genres?: VideoTaxonomyItem[];
  onAddToLibrary: () => void;
  onChooseFiles: (files: FileList | File[] | null) => void;
  onClearSession: () => void;
  onContentTypeChange: (value: string | undefined) => void;
  onDescriptionChange: (value: string) => void;
  onGenreSlugsChange: (value: string[]) => void;
  onRemoveSession: () => void;
  onRetryUpload: () => void;
  onTagsChange: (value: string[]) => void;
  onTitleChange: (value: string) => void;
  pageError: string | null;
  session: AddVideosSession | null;
  showPageHeader?: boolean;
}

export function AddVideosView({
  canAddToLibrary,
  contentTypes = [],
  genres = [],
  onAddToLibrary,
  onChooseFiles,
  onClearSession,
  onContentTypeChange,
  onDescriptionChange,
  onGenreSlugsChange,
  onRemoveSession,
  onRetryUpload,
  onTagsChange,
  onTitleChange,
  pageError,
  session,
  showPageHeader = true,
}: AddVideosViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const statusLabel = session
    ? {
        add_failed: 'Add Failed',
        adding_to_library: 'Adding to Library',
        completed: 'Added',
        upload_failed: 'Upload Failed',
        uploaded: 'Ready to Add',
        uploading: 'Uploading',
      }[session.status]
    : null;

  const handleFiles = (files: FileList | null) => {
    onChooseFiles(files);
  };

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {showPageHeader && (
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button asChild size="sm" variant="ghost">
                <Link to="/">
                  <ArrowLeft data-icon="inline-start" />
                  Back to Library
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold">Upload a video</h1>
            <p className="text-muted-foreground">
              Choose one video from your browser, review its details, then add it to your library.
            </p>
          </div>
        </div>
      )}

      {pageError ? (
        <Alert className="mb-6" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {session === null ? (
        <Empty className="gap-4 border border-dashed px-6 py-12">
          <EmptyHeader className="gap-2">
            <EmptyMedia>
              <FileVideo className="size-16 text-muted-foreground" />
            </EmptyMedia>
            <h2 className="text-lg font-semibold">Choose one video to upload</h2>
            <EmptyDescription>
              Upload starts immediately after you choose a file. You will review details before adding it to the library.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-xl gap-4 text-sm text-muted-foreground">
            <div
              className={`rounded-2xl border border-dashed p-8 text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                accept={BROWSER_UPLOAD_ACCEPT}
                className="hidden"
                id="choose-video-input"
                onChange={event => handleFiles(event.target.files)}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload data-icon="inline-start" />
                Choose Video
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">Or drag and drop a file here.</p>
            </div>
            <div className="space-y-1">
              <p>{`Supported formats: ${BROWSER_UPLOAD_SUPPORTED_FORMATS_LABEL}`}</p>
              <p>{`Maximum file size: ${BROWSER_UPLOAD_MAX_SIZE_LABEL}`}</p>
              <p>Only one file can be uploaded at a time.</p>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="gap-4 py-0">
          <CardHeader className="px-6 pt-6 pb-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileVideo className="mt-1 size-5 text-muted-foreground" />
                <div className="flex flex-col gap-2">
                  <h2 className="font-medium">{session.filename}</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{formatFileSize(session.size)}</Badge>
                    <Badge variant="outline">{session.mimeType}</Badge>
                    {statusLabel ? <Badge>{statusLabel}</Badge> : null}
                  </div>
                </div>
              </div>
              {session.status !== 'completed' && session.status !== 'adding_to_library' ? (
                <Button onClick={onRemoveSession} size="sm" type="button" variant="outline">
                  <X data-icon="inline-start" />
                  Remove
                </Button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 px-6 pb-6">
            {session.status === 'completed' && session.successMessage ? (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <Check className="text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-300">
                  {session.successMessage}
                </AlertDescription>
              </Alert>
            ) : null}

            {session.error ? (
              <Alert variant="destructive">
                <AlertDescription>{session.error}</AlertDescription>
              </Alert>
            ) : null}

            {session.status !== 'completed' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {session.status === 'uploading'
                      ? 'Uploading to the server staging area'
                      : session.status === 'adding_to_library'
                        ? 'Adding the staged file to the library'
                        : 'Review details before the final library commit'}
                  </span>
                  <span>{session.progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${session.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <Separator />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="upload-title">Title *</Label>
                <Input
                  disabled={session.status === 'adding_to_library'}
                  id="upload-title"
                  onChange={event => onTitleChange(event.target.value)}
                  placeholder="Enter video title"
                  value={session.metadata.title}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="upload-tags">Tags</Label>
                <VideoTagInput
                  ariaLabel="Tags"
                  disabled={session.status === 'adding_to_library'}
                  onChange={onTagsChange}
                  placeholder="Add tags like family, action, watch-later"
                  value={session.metadata.tags}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Content type</Label>
                <VideoTaxonomySingleSelect
                  ariaLabel="Content type"
                  disabled={session.status === 'adding_to_library'}
                  onChange={onContentTypeChange}
                  options={contentTypes}
                  placeholder="No content type"
                  value={session.metadata.contentTypeSlug}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Genre</Label>
                <VideoTaxonomyMultiSelect
                  ariaLabel="Genre"
                  disabled={session.status === 'adding_to_library'}
                  onChange={onGenreSlugsChange}
                  options={genres}
                  placeholder="No genres"
                  value={session.metadata.genreSlugs}
                />
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="upload-description">Description</Label>
                <Textarea
                  disabled={session.status === 'adding_to_library'}
                  id="upload-description"
                  onChange={event => onDescriptionChange(event.target.value)}
                  placeholder="Brief description of the video"
                  value={session.metadata.description}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              {session.status === 'upload_failed' ? (
                <Button onClick={onRetryUpload} type="button">
                  <RefreshCw data-icon="inline-start" />
                  Retry Upload
                </Button>
              ) : null}

              {session.status === 'completed' ? (
                <Button onClick={onClearSession} type="button">
                  <Upload data-icon="inline-start" />
                  Upload Another Video
                </Button>
              ) : (
                <Button
                  disabled={!canAddToLibrary || session.status === 'adding_to_library'}
                  onClick={onAddToLibrary}
                  type="button"
                >
                  {session.status === 'adding_to_library' ? (
                    <>
                      <RefreshCw className="animate-spin" data-icon="inline-start" />
                      Adding...
                    </>
                  ) : session.status === 'add_failed'
                    ? (
                        <>
                          <RefreshCw data-icon="inline-start" />
                          Retry Add to Library
                        </>
                      )
                    : (
                        <>
                          <Upload data-icon="inline-start" />
                          Add to Library
                        </>
                      )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

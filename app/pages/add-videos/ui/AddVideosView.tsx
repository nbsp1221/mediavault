import { ArrowLeft, Check, Clock, FileVideo, RefreshCw, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { VideoTaxonomyItem } from '~/modules/library/domain/video-taxonomy';
import type { AddVideosSession } from '~/pages/add-videos/model/useAddVideosView';
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
import { cn } from '~/shared/lib/utils';
import { Alert, AlertDescription } from '~/shared/ui/alert';
import { Badge } from '~/shared/ui/badge';
import { Button } from '~/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/shared/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '~/shared/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '~/shared/ui/field';
import { Input } from '~/shared/ui/input';
import { Separator } from '~/shared/ui/separator';
import { Textarea } from '~/shared/ui/textarea';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [tagValidation, setTagValidation] = useState<{ file: File; message: string | null } | null>(
    null,
  );
  const invalidTags = tagValidation?.file === session?.file && Boolean(tagValidation?.message);
  const accepted = session?.status === 'submitted' || session?.status === 'completed';
  const disabled = accepted || session?.status === 'adding_to_library';
  const statusLabel = session
    ? {
        add_failed: 'Add Failed',
        adding_to_library: 'Submitting',
        completed: 'Added',
        submitted: 'Sent to Processing',
        upload_failed: 'Upload Failed',
        uploaded: 'Ready to Add',
        uploading: 'Uploading',
      }[session.status]
    : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        showPageHeader && 'container mx-auto px-4 py-8 sm:px-6 lg:px-8',
      )}
    >
      {showPageHeader && (
        <header className="flex flex-col gap-4">
          <Button asChild size="sm" variant="ghost" className="self-start">
            <Link to="/">
              <ArrowLeft data-icon="inline-start" />
              Back to Library
            </Link>
          </Button>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold">Upload a video</h1>
            <p className="text-muted-foreground">
              Choose one video, review its details, then add it to your library.
            </p>
          </div>
        </header>
      )}
      {pageError && (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}
      {!session ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia>
              <FileVideo className="size-16 text-muted-foreground" />
            </EmptyMedia>
            <h2 className="text-lg font-semibold">Choose one video to upload</h2>
            <EmptyDescription>
              Upload starts immediately. Review details before processing; new videos are private.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-xl gap-4">
            <div
              className={cn(
                'w-full rounded-2xl border border-dashed p-8 text-center',
                isDragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
              )}
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
                onChooseFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                accept={BROWSER_UPLOAD_ACCEPT}
                className="hidden"
                id="choose-video-input"
                onChange={(event) => onChooseFiles(event.target.files)}
                type="file"
              />
              <Button onClick={() => fileInputRef.current?.click()} type="button">
                <Upload data-icon="inline-start" />
                Choose Video
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">Or drag and drop a file here.</p>
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p>Supported formats: {BROWSER_UPLOAD_SUPPORTED_FORMATS_LABEL}</p>
              <p>Maximum file size: {BROWSER_UPLOAD_MAX_SIZE_LABEL}</p>
              <p>Only one file can be uploaded at a time.</p>
              <p>
                File transfers cannot resume after leaving this page. Accepted processing jobs can.
              </p>
            </div>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="break-all">{session.filename}</h2>
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-2">
              <Badge variant="secondary">{formatFileSize(session.size)}</Badge>
              <Badge variant="outline" className="break-all">
                {session.mimeType}
              </Badge>
              <Badge>{statusLabel}</Badge>
            </CardDescription>
            {!disabled && (
              <CardAction>
                <Button onClick={onRemoveSession} size="sm" type="button" variant="outline">
                  <X data-icon="inline-start" />
                  Remove
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {accepted && session.successMessage && (
              <Alert role="status">
                {session.status === 'completed' ? <Check /> : <Clock />}
                <AlertDescription>{session.successMessage}</AlertDescription>
              </Alert>
            )}
            {session.error && (
              <Alert variant="destructive">
                <AlertDescription>{session.error}</AlertDescription>
              </Alert>
            )}
            {!accepted && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {session.status === 'uploading'
                      ? 'Uploading to the server staging area'
                      : session.status === 'adding_to_library'
                        ? 'Submitting the staged file for processing'
                        : 'Review details before the final library commit'}
                  </span>
                  <span>{session.progressPercent}%</span>
                </div>
                <progress
                  aria-label="File upload progress"
                  className="h-2 w-full accent-primary"
                  max={100}
                  value={session.progressPercent}
                />
              </div>
            )}
            <Separator />
            <FieldGroup>
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="upload-title">Title *</FieldLabel>
                <Input
                  disabled={disabled}
                  id="upload-title"
                  maxLength={200}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="Enter video title"
                  required
                  value={session.metadata.title}
                />
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="upload-tags">Tags</FieldLabel>
                <VideoTagInput
                  ariaLabel="Tags"
                  disabled={disabled}
                  onChange={onTagsChange}
                  onValidationChange={(message) =>
                    setTagValidation({ file: session.file, message })
                  }
                  placeholder="Add tags like family, action, watch-later"
                  value={session.metadata.tags}
                />
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel>Content type</FieldLabel>
                <VideoTaxonomySingleSelect
                  ariaLabel="Content type"
                  disabled={disabled}
                  onChange={onContentTypeChange}
                  options={contentTypes}
                  placeholder="No content type"
                  value={session.metadata.contentTypeSlug}
                />
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel>Genre</FieldLabel>
                <VideoTaxonomyMultiSelect
                  ariaLabel="Genre"
                  disabled={disabled}
                  onChange={onGenreSlugsChange}
                  options={genres}
                  placeholder="No genres"
                  value={session.metadata.genreSlugs}
                />
              </Field>
              <Field data-disabled={disabled}>
                <FieldLabel htmlFor="upload-description">Description</FieldLabel>
                <Textarea
                  disabled={disabled}
                  id="upload-description"
                  maxLength={1000}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder="Brief description of the video"
                  value={session.metadata.description}
                />
              </Field>
              <Field>
                <FieldLabel>Visibility</FieldLabel>
                <Badge variant="secondary" className="self-start">
                  Private by default
                </Badge>
                <FieldDescription>
                  Only you can watch this video. You can make it public later from video details.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-3">
            {session.status === 'upload_failed' && (
              <Button onClick={onRetryUpload} type="button">
                <RefreshCw data-icon="inline-start" />
                Retry Upload
              </Button>
            )}
            {accepted ? (
              <Button onClick={onClearSession} type="button">
                <Upload data-icon="inline-start" />
                Upload Another Video
              </Button>
            ) : (
              <Button
                disabled={!canAddToLibrary || disabled || invalidTags}
                onClick={onAddToLibrary}
                type="button"
              >
                {session.status === 'adding_to_library' ? (
                  <>
                    <RefreshCw className="animate-spin" data-icon="inline-start" />
                    Adding...
                  </>
                ) : session.status === 'add_failed' ? (
                  <>
                    <RefreshCw data-icon="inline-start" />
                    Retry Add to Library
                  </>
                ) : (
                  <>
                    <Upload data-icon="inline-start" />
                    Add to Library
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { IngestJobView } from '~/modules/ingest/domain/ingest-job-view';
import { ingestJobMutationResponseSchema } from '~/pages/add-videos/model/ingest-job-response';
import {
  type UploadBrowserFile,
  uploadBrowserFile as uploadBrowserFileDefault,
} from './upload-browser-file';

export interface FileMetadataState {
  title: string;
  tags: string[];
  contentTypeSlug?: string;
  genreSlugs: string[];
  description: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AddVideosSessionStatus =
  | 'uploading'
  | 'upload_failed'
  | 'uploaded'
  | 'adding_to_library'
  | 'add_failed'
  | 'submitted'
  | 'completed';

export interface AddVideosSession {
  error: string | null;
  file: File;
  filename: string;
  metadata: FileMetadataState;
  mimeType: string;
  progressPercent: number;
  size: number;
  stagingId: string | null;
  status: AddVideosSessionStatus;
  successMessage: string | null;
}

interface UseAddVideosViewDependencies {
  fetchImpl?: FetchLike;
  onAccepted?: (job: IngestJobView) => void;
  uploadBrowserFile?: UploadBrowserFile;
}

interface UseAddVideosViewResult {
  pageError: string | null;
  session: AddVideosSession | null;
  canAddToLibrary: boolean;
  handleAddToLibrary: () => Promise<void>;
  handleChooseFiles: (files: FileList | File[] | null) => void;
  handleClearSession: () => void;
  handleDescriptionChange: (value: string) => void;
  handleContentTypeChange: (value: string | undefined) => void;
  handleGenreSlugsChange: (value: string[]) => void;
  handleRemoveSession: () => Promise<void>;
  handleRetryUpload: () => void;
  handleTagsChange: (value: string[]) => void;
  handleTitleChange: (value: string) => void;
}

function createInitialMetadata(filename: string): FileMetadataState {
  return {
    title: filename.replace(/\.[^/.]+$/, ''),
    tags: [],
    genreSlugs: [],
    description: '',
  };
}

function createUploadSession(file: File, metadata?: FileMetadataState): AddVideosSession {
  return {
    error: null,
    file,
    filename: file.name,
    metadata: metadata ?? createInitialMetadata(file.name),
    mimeType: file.type || 'application/octet-stream',
    progressPercent: 0,
    size: file.size,
    stagingId: null,
    status: 'uploading',
    successMessage: null,
  };
}

export function useAddVideosView(deps: UseAddVideosViewDependencies = {}): UseAddVideosViewResult {
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const uploadBrowserFile = deps.uploadBrowserFile ?? uploadBrowserFileDefault;
  const [pageError, setPageError] = useState<string | null>(null);
  const [session, setSession] = useState<AddVideosSession | null>(null);
  const uploadTokenRef = useRef(0);
  const abortUploadRef = useRef<(() => void) | null>(null);
  const submittingRef = useRef(false);

  useEffect(
    () => () => {
      uploadTokenRef.current++;
      abortUploadRef.current?.();
    },
    [],
  );

  const resetSession = () => {
    abortUploadRef.current = null;
    setSession(null);
    setPageError(null);
  };

  const updateSession = (patcher: (current: AddVideosSession) => AddVideosSession) => {
    setSession((current) => {
      if (!current) {
        return current;
      }

      return patcher(current);
    });
  };

  const startUpload = (file: File, metadata?: FileMetadataState) => {
    const uploadToken = uploadTokenRef.current + 1;
    uploadTokenRef.current = uploadToken;
    setPageError(null);
    setSession(createUploadSession(file, metadata));

    const uploadRequest = uploadBrowserFile(file, {
      onProgress(uploadedBytes, totalBytes) {
        if (uploadTokenRef.current !== uploadToken) {
          return;
        }

        setSession((current) => {
          if (!current || current.file !== file) {
            return current;
          }

          return {
            ...current,
            progressPercent:
              totalBytes > 0
                ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
                : current.progressPercent,
          };
        });
      },
    });
    abortUploadRef.current = uploadRequest.abort;

    void uploadRequest.done
      .then((result) => {
        if (uploadTokenRef.current !== uploadToken) {
          return;
        }

        abortUploadRef.current = null;
        setSession((current) => {
          if (!current || current.file !== file) {
            return current;
          }

          return {
            ...current,
            filename: result.filename,
            mimeType: result.mimeType,
            progressPercent: 100,
            size: result.size,
            stagingId: result.stagingId,
            status: 'uploaded',
          };
        });
      })
      .catch((error: unknown) => {
        if (uploadTokenRef.current !== uploadToken) {
          return;
        }

        abortUploadRef.current = null;
        const message = error instanceof Error ? error.message : 'Upload failed.';
        setSession((current) => {
          if (!current || current.file !== file) {
            return current;
          }

          return {
            ...current,
            error: message,
            status: 'upload_failed',
          };
        });
      });
  };

  const handleChooseFiles = (files: FileList | File[] | null) => {
    const nextFiles = files ? Array.from(files) : [];

    if (nextFiles.length === 0) {
      return;
    }

    if (nextFiles.length > 1) {
      setPageError('Only one file can be uploaded at a time.');
      return;
    }

    if (session && session.status !== 'completed') {
      setPageError('Finish or remove the current upload before starting another one.');
      return;
    }

    startUpload(nextFiles[0]);
  };

  const updateSessionMetadata = (updater: (metadata: FileMetadataState) => FileMetadataState) => {
    updateSession((current) => {
      return {
        ...current,
        metadata: updater(current.metadata),
      };
    });
  };

  const handleTitleChange = (value: string) => {
    updateSessionMetadata((current) => ({ ...current, title: value }));
  };

  const handleTagsChange = (value: string[]) => {
    updateSessionMetadata((current) => ({ ...current, tags: value }));
  };

  const handleContentTypeChange = (value: string | undefined) => {
    updateSessionMetadata((current) => ({ ...current, contentTypeSlug: value }));
  };

  const handleGenreSlugsChange = (value: string[]) => {
    updateSessionMetadata((current) => ({ ...current, genreSlugs: value }));
  };

  const handleDescriptionChange = (value: string) => {
    updateSessionMetadata((current) => ({ ...current, description: value }));
  };

  const handleAddToLibrary = async () => {
    if (
      submittingRef.current ||
      !session ||
      !session.stagingId ||
      (session.status !== 'uploaded' && session.status !== 'add_failed')
    ) {
      return;
    }

    if (!session.metadata.title.trim()) {
      updateSession((current) => ({
        ...current,
        error: 'Please enter a title.',
        status: 'add_failed',
      }));
      return;
    }

    submittingRef.current = true;
    updateSession((current) => ({
      ...current,
      error: null,
      status: 'adding_to_library',
      successMessage: null,
    }));

    try {
      const response = await fetchImpl(`/api/uploads/${session.stagingId}/commit`, {
        body: JSON.stringify({
          contentTypeSlug: session.metadata.contentTypeSlug,
          description: session.metadata.description.trim() || undefined,
          genreSlugs: session.metadata.genreSlugs,
          tags: session.metadata.tags,
          title: session.metadata.title.trim(),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const data = ingestJobMutationResponseSchema.parse(await response.json());

      if (!response.ok || !data.success || !data.job) {
        setSession((current) =>
          current
            ? {
                ...current,
                error: data.error || 'Failed to add to library.',
                status: 'add_failed',
              }
            : current,
        );
        return;
      }

      deps.onAccepted?.(data.job);
      const completed = data.job.state === 'succeeded';
      setSession((current) =>
        current
          ? {
              ...current,
              error: null,
              status: completed ? 'completed' : 'submitted',
              successMessage: completed
                ? `"${current.metadata.title.trim()}" has been added to the library.`
                : 'Accepted for processing. Follow progress below; it is safe to leave this page.',
            }
          : current,
      );
    } catch (error) {
      setSession((current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : 'Failed to add to library.',
              status: 'add_failed',
            }
          : current,
      );
    } finally {
      submittingRef.current = false;
    }
  };

  const handleRemoveSession = async () => {
    if (!session) {
      return;
    }

    if (session.status === 'adding_to_library') {
      return;
    }

    uploadTokenRef.current += 1;

    if (session.status === 'uploading') {
      abortUploadRef.current?.();
      resetSession();
      return;
    }

    if (session.stagingId && (session.status === 'uploaded' || session.status === 'add_failed')) {
      try {
        const response = await fetchImpl(`/api/uploads/${session.stagingId}`, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error('Failed to remove the staged upload.');
        }
      } catch {
        updateSession((current) => ({ ...current, error: 'Failed to remove the staged upload.' }));
        return;
      }
    }

    resetSession();
  };

  const handleRetryUpload = () => {
    if (!session) {
      return;
    }

    startUpload(session.file, session.metadata);
  };

  const handleClearSession = () => {
    uploadTokenRef.current += 1;
    abortUploadRef.current?.();
    resetSession();
  };

  const canAddToLibrary = Boolean(
    session &&
    (session.status === 'uploaded' || session.status === 'add_failed') &&
    session.stagingId &&
    session.metadata.title.trim(),
  );

  return {
    pageError,
    session,
    canAddToLibrary,
    handleAddToLibrary,
    handleChooseFiles,
    handleClearSession,
    handleDescriptionChange,
    handleContentTypeChange,
    handleGenreSlugsChange,
    handleRemoveSession,
    handleRetryUpload,
    handleTagsChange,
    handleTitleChange,
  };
}

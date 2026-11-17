import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  UploadBrowserFile,
  UploadBrowserFileOptions,
  UploadBrowserFileResult,
} from '~/pages/add-videos/model/upload-browser-file';
import { useAddVideosView } from '~/pages/add-videos/model/useAddVideosView';
import { createDeferred } from '../../helpers/create-deferred';
import { createIngestJobView } from '../../support/ingest-job-fixture';

function transfer(file: File, options?: UploadBrowserFileOptions) {
  return {
    ...createDeferred<UploadBrowserFileResult>(),
    file,
    abort: vi.fn(),
    progress: (loaded: number, total: number) => options?.onProgress?.(loaded, total),
  };
}

const file = () => new File(['test-owned media'], 'clip.release.mp4', { type: 'video/mp4' });

const receipt = {
  filename: 'server-name.mp4',
  mimeType: 'video/server-type',
  size: 123,
  stagingId: 'stage-123',
};

function fixture(
  fetchImpl = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ success: true, job: createIngestJobView() }, { status: 202 }),
  ),
) {
  const transfers: ReturnType<typeof transfer>[] = [];
  const upload = vi.fn<UploadBrowserFile>((selected, options) => {
    const current = transfer(selected, options);
    transfers.push(current);
    return { done: current.promise, abort: current.abort };
  });
  const onAccepted = vi.fn();
  const hook = renderHook(() =>
    useAddVideosView({ fetchImpl, uploadBrowserFile: upload, onAccepted }),
  );
  return { ...hook, transfers, upload, fetchImpl, onAccepted };
}

async function uploaded(f: ReturnType<typeof fixture>) {
  act(() => f.result.current.handleChooseFiles([file()]));
  await act(async () => f.transfers[0].resolve(receipt));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('upload draft and asynchronous operation contracts', () => {
  test('empty selection and idle actions never allocate transfer or server work', async () => {
    const f = fixture();
    expect(f.result.current.canAddToLibrary).toBe(false);
    act(() => {
      f.result.current.handleChooseFiles(null);
      f.result.current.handleChooseFiles([]);
      f.result.current.handleRetryUpload();
      f.result.current.handleTitleChange('ignored');
      f.result.current.handleTagsChange(['ignored']);
      f.result.current.handleDescriptionChange('ignored');
      f.result.current.handleContentTypeChange('movie');
      f.result.current.handleGenreSlugsChange(['drama']);
    });
    await act(async () => {
      await f.result.current.handleAddToLibrary();
      await f.result.current.handleRemoveSession();
    });
    expect(f.result.current.session).toBeNull();
    expect(f.result.current.pageError).toBeNull();
    expect(f.upload).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  test('initial metadata strips only the final extension and receipt fields never replace the actual retry file', async () => {
    const f = fixture();
    const selected = new File(['test'], 'clip.release.mp4');
    act(() => f.result.current.handleChooseFiles([selected]));
    expect(f.result.current.session).toMatchObject({
      file: selected,
      filename: selected.name,
      mimeType: 'application/octet-stream',
      size: selected.size,
      progressPercent: 0,
      status: 'uploading',
      error: null,
      successMessage: null,
      stagingId: null,
    });
    expect(f.result.current.session?.metadata).toEqual({
      title: 'clip.release',
      tags: [],
      genreSlugs: [],
      description: '',
    });
    expect(f.result.current.canAddToLibrary).toBe(false);
    await act(async () => f.transfers[0].resolve(receipt));
    expect(f.result.current.session).toMatchObject({
      ...receipt,
      file: selected,
      progressPercent: 100,
      status: 'uploaded',
    });
    expect(f.result.current.session?.metadata.title).toBe('clip.release');
    expect(f.result.current.canAddToLibrary).toBe(true);
    f.unmount();
    expect(f.transfers[0].abort).not.toHaveBeenCalled();
  });

  test('byte progress is rounded, capped at 100 and unchanged when total is unknown', () => {
    const f = fixture();
    act(() => f.result.current.handleChooseFiles([file()]));
    act(() => f.transfers[0].progress(2, 3));
    expect(f.result.current.session?.progressPercent).toBe(67);
    act(() => f.transfers[0].progress(99, 0));
    expect(f.result.current.session?.progressPercent).toBe(67);
    act(() => f.transfers[0].progress(9, 3));
    expect(f.result.current.session?.progressPercent).toBe(100);
    expect(f.result.current.session?.status).toBe('uploading');
  });

  test.each(['progress', 'resolve', 'reject'] as const)(
    'late %s from a discarded transfer cannot modify a new transfer of the same File',
    async (event) => {
      const f = fixture();
      const selected = file();
      act(() => f.result.current.handleChooseFiles([selected]));
      act(() => f.result.current.handleClearSession());
      expect(f.transfers[0].abort).toHaveBeenCalledOnce();
      act(() => f.result.current.handleChooseFiles([selected]));
      act(() => f.transfers[1].progress(2, 5));
      await act(async () => {
        if (event === 'progress') {
          f.transfers[0].progress(99, 100);
        }
        if (event === 'resolve') {
          f.transfers[0].resolve(receipt);
        }
        if (event === 'reject') {
          f.transfers[0].reject(new Error('obsolete transfer failure'));
        }
      });
      expect(f.result.current.session).toMatchObject({
        status: 'uploading',
        stagingId: null,
        progressPercent: 40,
        error: null,
      });
      act(() => f.result.current.handleClearSession());
      expect(f.transfers[1].abort).toHaveBeenCalledOnce();
      expect(f.result.current.session).toBeNull();
    },
  );

  test('an active transfer cannot be silently replaced, and unmount aborts only its current request', () => {
    const f = fixture();
    const original = file();
    act(() => f.result.current.handleChooseFiles([original]));
    act(() => f.result.current.handleChooseFiles([new File(['second'], 'another.mp4')]));
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.result.current.session?.file).toBe(original);
    expect(f.result.current.pageError).toBeTruthy();
    f.unmount();
    expect(f.transfers[0].abort).toHaveBeenCalledOnce();
  });

  test.each([new Error('network disconnected'), 'opaque transport rejection'])(
    'failed transfer is retryable with its edited metadata and original bytes',
    async (failure) => {
      const f = fixture();
      const selected = file();
      act(() => f.result.current.handleChooseFiles([selected]));
      act(() => {
        f.result.current.handleTitleChange('Edited title');
        f.result.current.handleTagsChange(['보관', 'some text']);
        f.result.current.handleDescriptionChange('Edited description');
        f.result.current.handleContentTypeChange('movie');
        f.result.current.handleGenreSlugsChange(['drama']);
        f.transfers[0].progress(1, 2);
      });
      await act(async () => f.transfers[0].reject(failure));
      expect(f.result.current.session).toMatchObject({
        status: 'upload_failed',
        progressPercent: 50,
        error: failure instanceof Error ? failure.message : 'Upload failed.',
      });
      expect(f.result.current.canAddToLibrary).toBe(false);
      act(() => f.result.current.handleChooseFiles([file()]));
      expect(f.result.current.pageError).toBeTruthy();
      act(() => f.result.current.handleRetryUpload());
      expect(f.upload).toHaveBeenCalledTimes(2);
      expect(f.transfers[1].file).toBe(selected);
      expect(f.result.current.pageError).toBeNull();
      expect(f.result.current.session).toMatchObject({
        status: 'uploading',
        progressPercent: 0,
        error: null,
        successMessage: null,
        stagingId: null,
      });
      expect(f.result.current.session?.metadata).toEqual({
        title: 'Edited title',
        tags: ['보관', 'some text'],
        description: 'Edited description',
        contentTypeSlug: 'movie',
        genreSlugs: ['drama'],
      });
      act(() => f.transfers[0].progress(99, 100));
      expect(f.result.current.session?.progressPercent).toBe(0);
      await act(async () => f.transfers[1].resolve(receipt));
      expect(f.result.current.canAddToLibrary).toBe(true);
      expect(f.result.current.session?.status).toBe('uploaded');
    },
  );

  test('blank title is not submitted, then corrected metadata commits exactly once with the authoritative receipt', async () => {
    const f = fixture();
    await uploaded(f);
    act(() => f.result.current.handleTitleChange(' \n '));
    expect(f.result.current.canAddToLibrary).toBe(false);
    await act(async () => f.result.current.handleAddToLibrary());
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.result.current.session?.status).toBe('add_failed');
    expect(f.result.current.session?.error).toBeTruthy();
    act(() => {
      f.result.current.handleTitleChange('  Ready title  ');
      f.result.current.handleTagsChange(['보관', 'some text']);
      f.result.current.handleDescriptionChange('  \n ');
      f.result.current.handleContentTypeChange('movie');
      f.result.current.handleGenreSlugsChange(['action', 'drama']);
    });
    expect(f.result.current.canAddToLibrary).toBe(true);
    await act(async () => f.result.current.handleAddToLibrary());
    expect(f.fetchImpl).toHaveBeenCalledExactlyOnceWith('/api/uploads/stage-123/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentTypeSlug: 'movie',
        genreSlugs: ['action', 'drama'],
        tags: ['보관', 'some text'],
        title: 'Ready title',
      }),
    });
    expect(f.result.current.session).toMatchObject({
      status: 'submitted',
      error: null,
      stagingId: 'stage-123',
    });
    expect(f.result.current.canAddToLibrary).toBe(false);
    expect(f.onAccepted).toHaveBeenCalledExactlyOnceWith(createIngestJobView());
  });

  test('submission cannot run while bytes are transferring or be removed while acceptance is pending', async () => {
    const response = createDeferred<Response>();
    const f = fixture(vi.fn(() => response.promise));
    act(() => f.result.current.handleChooseFiles([file()]));
    await act(async () => f.result.current.handleAddToLibrary());
    expect(f.fetchImpl).not.toHaveBeenCalled();
    await act(async () => f.transfers[0].resolve(receipt));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = f.result.current.handleAddToLibrary();
    });
    expect(f.result.current.session?.status).toBe('adding_to_library');
    expect(f.result.current.canAddToLibrary).toBe(false);
    await act(async () => f.result.current.handleRemoveSession());
    expect(f.result.current.session?.status).toBe('adding_to_library');
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    await act(async () => {
      response.resolve(
        Response.json({ success: true, job: createIngestJobView() }, { status: 202 }),
      );
      await pending;
    });
  });

  test.each([
    [
      'HTTP failure despite success payload',
      () => Response.json({ success: true, job: createIngestJobView() }, { status: 503 }),
    ],
    [
      'negative business result despite HTTP success',
      () =>
        Response.json({
          success: false,
          job: createIngestJobView(),
          error: 'Admission unavailable',
        }),
    ],
    ['missing authoritative job', () => Response.json({ success: true })],
    ['malformed JSON', () => new Response('not JSON')],
  ] as const)(
    '%s retains the stage and releases the submission guard for retry',
    async (_name, makeResponse) => {
      const fetchImpl = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
        makeResponse(),
      );
      const f = fixture(fetchImpl);
      await uploaded(f);
      await act(async () => f.result.current.handleAddToLibrary());
      expect(f.result.current.session).toMatchObject({
        status: 'add_failed',
        stagingId: 'stage-123',
      });
      expect(f.result.current.session?.error).toBeTruthy();
      expect(f.result.current.canAddToLibrary).toBe(true);
      expect(f.onAccepted).not.toHaveBeenCalled();
      fetchImpl.mockResolvedValue(
        Response.json({ success: true, job: createIngestJobView() }, { status: 202 }),
      );
      await act(async () => f.result.current.handleAddToLibrary());
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(f.result.current.session).toMatchObject({ status: 'submitted', error: null });
      expect(f.onAccepted).toHaveBeenCalledOnce();
    },
  );

  test.each([new Error('offline'), 'opaque rejection'])(
    'commit transport rejection keeps retry possible rather than stranding a submitting latch',
    async (failure) => {
      const f = fixture();
      f.fetchImpl.mockRejectedValueOnce(failure);
      await uploaded(f);
      await act(async () => f.result.current.handleAddToLibrary());
      expect(f.result.current.session?.status).toBe('add_failed');
      expect(f.result.current.session?.error).toBeTruthy();
      expect(f.onAccepted).not.toHaveBeenCalled();
      await act(async () => f.result.current.handleAddToLibrary());
      expect(f.result.current.session?.status).toBe('submitted');
      expect(f.fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  test.each(['uploaded', 'add_failed'] as const)(
    'removing a %s stage uses DELETE; a failed removal never forgets the source',
    async (status) => {
      const f = fixture();
      await uploaded(f);
      if (status === 'add_failed') {
        f.fetchImpl.mockResolvedValueOnce(
          Response.json({ success: false, error: 'Try later' }, { status: 503 }),
        );
        await act(async () => f.result.current.handleAddToLibrary());
      }
      f.fetchImpl.mockResolvedValueOnce(new Response(null, { status: 500 }));
      await act(async () => f.result.current.handleRemoveSession());
      expect(f.result.current.session).toMatchObject({ status, stagingId: 'stage-123' });
      expect(f.result.current.session?.error).toBeTruthy();
      f.fetchImpl.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await act(async () => f.result.current.handleRemoveSession());
      expect(f.fetchImpl).toHaveBeenLastCalledWith('/api/uploads/stage-123', { method: 'DELETE' });
      expect(f.result.current.session).toBeNull();
      expect(f.result.current.pageError).toBeNull();
      expect(f.transfers[0].abort).not.toHaveBeenCalled();
    },
  );

  test('removing unaccepted bytes aborts the request without inventing a staging DELETE', async () => {
    const f = fixture();
    act(() => f.result.current.handleChooseFiles([file()]));
    await act(async () => f.result.current.handleRemoveSession());
    expect(f.transfers[0].abort).toHaveBeenCalledOnce();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.result.current.session).toBeNull();
    await act(async () => f.transfers[0].resolve(receipt));
    expect(f.result.current.session).toBeNull();
  });

  test('a failed unstaged transfer is discarded locally, while a completed published session can start another file', async () => {
    const f = fixture();
    act(() => f.result.current.handleChooseFiles([file()]));
    await act(async () => f.transfers[0].reject(new Error('transfer failed')));
    await act(async () => f.result.current.handleRemoveSession());
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.result.current.session).toBeNull();
    act(() => f.result.current.handleChooseFiles([file()]));
    await act(async () => f.transfers[1].resolve(receipt));
    f.fetchImpl.mockResolvedValueOnce(
      Response.json({ success: true, job: createIngestJobView({ state: 'succeeded' }) }),
    );
    await act(async () => f.result.current.handleAddToLibrary());
    expect(f.result.current.session?.status).toBe('completed');
    act(() =>
      f.result.current.handleChooseFiles([
        new File(['second'], 'second.mkv', { type: 'video/x-matroska' }),
      ]),
    );
    expect(f.upload).toHaveBeenCalledTimes(3);
    expect(f.result.current.session).toMatchObject({
      status: 'uploading',
      filename: 'second.mkv',
      mimeType: 'video/x-matroska',
      metadata: { title: 'second' },
    });
  });
});

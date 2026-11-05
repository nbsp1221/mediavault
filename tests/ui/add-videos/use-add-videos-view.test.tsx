import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { UploadBrowserFile } from '../../../app/pages/add-videos/model/upload-browser-file';
import { useAddVideosView } from '../../../app/pages/add-videos/model/useAddVideosView';
import { createIngestJobView } from '../../support/ingest-job-fixture';

function createFile(name: string, content = 'video-data', type = 'video/mp4') {
  return new File([content], name, { type });
}

describe('useAddVideosView', () => {
  test('starts a single browser upload session and seeds metadata from the selected file', async () => {
    const uploadBrowserFile: UploadBrowserFile = (file, options) => {
      options?.onProgress?.(5, 10);

      return {
        abort: vi.fn(),
        done: Promise.resolve({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          stagingId: 'staging-123',
        }),
      };
    };

    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl: vi.fn(),
        uploadBrowserFile,
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('fixture-video.mp4')]);
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('uploaded');
    });

    expect(result.current.session).toEqual(
      expect.objectContaining({
        filename: 'fixture-video.mp4',
        progressPercent: 100,
        stagingId: 'staging-123',
      }),
    );
    expect(result.current.session?.metadata.title).toBe('fixture-video');
    expect(result.current.canAddToLibrary).toBe(true);
  });

  test('rejects multiple files instead of queueing them', () => {
    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl: vi.fn(),
        uploadBrowserFile: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('first.mp4'), createFile('second.mp4')]);
    });

    expect(result.current.pageError).toBe('Only one file can be uploaded at a time.');
    expect(result.current.session).toBeNull();
  });

  test('posts the staged commit request and moves the session into completed on success', async () => {
    const fetchImpl = vi.fn(
      async (_input: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            job: createIngestJobView({ state: 'succeeded' }),
            success: true,
          }),
        ),
    );

    const uploadBrowserFile: UploadBrowserFile = (file) => ({
      abort: vi.fn(),
      done: Promise.resolve({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        stagingId: 'staging-123',
      }),
    });

    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl,
        uploadBrowserFile,
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('fixture-video.mp4')]);
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('uploaded');
    });

    act(() => {
      result.current.handleTitleChange('Custom title');
      result.current.handleTagsChange(['one', 'two']);
      result.current.handleDescriptionChange('Custom description');
    });

    await act(async () => {
      await result.current.handleAddToLibrary();
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/uploads/staging-123/commit',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    const commitRequest = fetchImpl.mock.calls[0]?.[1];
    if (typeof commitRequest?.body !== 'string') {
      throw new Error('Expected serialized metadata body.');
    }
    expect(JSON.parse(commitRequest.body)).toEqual({
      description: 'Custom description',
      genreSlugs: [],
      tags: ['one', 'two'],
      title: 'Custom title',
    });
    expect(result.current.session?.status).toBe('completed');
    expect(result.current.session?.successMessage).toBe(
      '"Custom title" has been added to the library.',
    );
  });

  test('aborts the active upload when the session is removed mid-transfer', async () => {
    const abort = vi.fn();
    let resolveUpload!: (value: {
      filename: string;
      mimeType: string;
      size: number;
      stagingId: string;
    }) => void;

    const uploadBrowserFile: UploadBrowserFile = () => ({
      abort,
      done: new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    });

    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl: vi.fn(),
        uploadBrowserFile,
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('fixture-video.mp4')]);
    });

    await act(async () => {
      await result.current.handleRemoveSession();
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(result.current.session).toBeNull();

    await act(async () => {
      resolveUpload({
        filename: 'fixture-video.mp4',
        mimeType: 'video/mp4',
        size: 10,
        stagingId: 'staging-123',
      });
    });

    expect(result.current.session).toBeNull();
  });

  test('keeps the session visible when staged-upload removal fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));

    const uploadBrowserFile: UploadBrowserFile = (file) => ({
      abort: vi.fn(),
      done: Promise.resolve({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        stagingId: 'staging-123',
      }),
    });

    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl,
        uploadBrowserFile,
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('fixture-video.mp4')]);
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('uploaded');
    });

    await act(async () => {
      await result.current.handleRemoveSession();
    });

    expect(result.current.session?.filename).toBe('fixture-video.mp4');
    expect(result.current.session?.error).toBe('Failed to remove the staged upload.');
  });

  test('ignores remove requests while add-to-library is already in progress', async () => {
    let resolveCommit!: () => void;
    const fetchImpl = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        resolveCommit = resolve;
      });

      return new Response(
        JSON.stringify({
          success: true,
          job: createIngestJobView({ state: 'succeeded' }),
        }),
      );
    });

    const uploadBrowserFile: UploadBrowserFile = (file) => ({
      abort: vi.fn(),
      done: Promise.resolve({
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        stagingId: 'staging-123',
      }),
    });

    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl,
        uploadBrowserFile,
      }),
    );

    act(() => {
      result.current.handleChooseFiles([createFile('fixture-video.mp4')]);
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('uploaded');
    });

    let addPromise!: Promise<void>;
    act(() => {
      addPromise = result.current.handleAddToLibrary();
    });

    await waitFor(() => {
      expect(result.current.session?.status).toBe('adding_to_library');
    });

    await act(async () => {
      await result.current.handleRemoveSession();
    });

    expect(result.current.session?.status).toBe('adding_to_library');

    await act(async () => {
      resolveCommit();
      await addPromise;
    });

    expect(result.current.session?.status).toBe('completed');
  });

  test('202 is submitted rather than completed, prevents duplicate acceptance, and hands off persisted job monitoring', async () => {
    const queued = createIngestJobView();
    const fetchImpl = vi.fn(async () =>
      Response.json({ success: true, job: queued }, { status: 202 }),
    );
    const onAccepted = vi.fn();
    const { result } = renderHook(() =>
      useAddVideosView({
        fetchImpl,
        onAccepted,
        uploadBrowserFile: (file) => ({
          abort: vi.fn(),
          done: Promise.resolve({
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            stagingId: 'staging-123',
          }),
        }),
      }),
    );
    act(() => result.current.handleChooseFiles([createFile('fixture.mp4')]));
    await waitFor(() => expect(result.current.session?.status).toBe('uploaded'));
    await act(async () => {
      await Promise.all([result.current.handleAddToLibrary(), result.current.handleAddToLibrary()]);
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(onAccepted).toHaveBeenCalledWith(queued);
    expect(result.current.session?.status).toBe('submitted');
    expect(result.current.session?.successMessage).not.toContain('has been added');
    act(() => result.current.handleClearSession());
    expect(result.current.session).toBeNull();
  });
});

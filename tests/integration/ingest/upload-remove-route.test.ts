import { describe, expect, test, vi } from 'vitest';
import type { RemoveStagedUploadUseCase } from '~/modules/ingest/application/use-cases/remove-staged-upload.usecase';
import {
  createUploadReadLoader,
  createUploadRemoveAction,
} from '~/routes/.server/staged-upload-handlers';

function fixture() {
  const execute = vi.fn<RemoveStagedUploadUseCase['execute']>(async () => ({ ok: true }));
  const requireProtectedApiSessionValue = vi.fn(async () => ({ userId: 'owner' }));
  const getServerIngestServices = vi.fn(() => ({ removeStagedUpload: { execute } }));
  return {
    action: createUploadRemoveAction({ getServerIngestServices, requireProtectedApiSessionValue }),
    execute,
    getServerIngestServices,
    requireProtectedApiSessionValue,
  };
}

const request = () => new Request('http://localhost/api/uploads/stage', { method: 'DELETE' });

describe('explicit staged source removal HTTP boundary', () => {
  test('returns 204 only after owner-aware removal and keeps response private', async () => {
    const f = fixture();
    const response = await f.action({ params: { stagingId: 'stage' }, request: request() });
    expect(f.execute).toHaveBeenCalledWith({ ownerId: 'owner', stagingId: 'stage' });
    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test.each([
    ['REMOVE_STAGED_UPLOAD_CONFLICT', 409],
    ['REMOVE_STAGED_UPLOAD_NOT_FOUND', 404],
  ] as const)('maps %s without claiming deletion', async (reason, status) => {
    const f = fixture();
    f.execute.mockResolvedValue({ ok: false, message: 'Unavailable', reason });
    expect((await f.action({ params: { stagingId: 'stage' }, request: request() })).status).toBe(
      status,
    );
  });

  test('unsupported method does not authenticate, assemble services or remove files', async () => {
    const f = fixture();
    expect(
      (
        await f.action({
          params: { stagingId: 'stage' },
          request: new Request('http://localhost/api/uploads/stage'),
        })
      ).status,
    ).toBe(405);
    expect(f.getServerIngestServices).not.toHaveBeenCalled();
  });

  test('read uses the same neutral404 contract and never returns owner or filesystem state', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      reason: 'STAGED_UPLOAD_NOT_FOUND' as const,
    }));
    const loader = createUploadReadLoader({
      getServerIngestServices: () => ({ readStagedUpload: { execute } }),
      requireProtectedApiSessionValue: async () => ({ userId: 'owner' }),
    });
    const response = await loader({
      params: { stagingId: 'other' },
      request: new Request('http://localhost/api/uploads/other'),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Staged upload not found',
      success: false,
    });
  });
});

import { describe, expect, test } from 'vitest';
import type { AuthenticatedViewer, RequestViewer } from './request-viewer';
import { ANONYMOUS_VIEWER } from './request-viewer';

describe('RequestViewer', () => {
  test('represents anonymous requests as a first-class subject', () => {
    expect(ANONYMOUS_VIEWER).toEqual({
      type: 'anonymous',
    });
  });

  test('keeps authenticated viewers identity-only without role authority', () => {
    const viewer: RequestViewer = {
      type: 'authenticated',
      userId: 'owner-1',
      username: 'Owner',
    } satisfies AuthenticatedViewer;

    expect(viewer).toEqual({
      type: 'authenticated',
      userId: 'owner-1',
      username: 'Owner',
    });
    expect(viewer).not.toHaveProperty('role');
  });
});

import { describe, expect, test } from 'vitest';
import { toVideoPolicyViewer } from '../../../app/composition/server/video-access-viewer';
import { type RequestViewer, ANONYMOUS_VIEWER } from '../../../app/modules/auth/domain/request-viewer';

describe('request viewer to video policy viewer adapter', () => {
  test('maps anonymous request viewers to anonymous video policy viewers', () => {
    expect(toVideoPolicyViewer(ANONYMOUS_VIEWER)).toEqual({
      type: 'anonymous',
    });
  });

  test('maps authenticated request viewers without leaking account projection fields', () => {
    const viewer: RequestViewer = {
      type: 'authenticated',
      userId: 'owner-1',
      username: 'Owner',
    };

    expect(toVideoPolicyViewer(viewer)).toEqual({
      type: 'authenticated',
      userId: 'owner-1',
    });
    expect(toVideoPolicyViewer(viewer)).not.toHaveProperty('username');
    expect(toVideoPolicyViewer(viewer)).not.toHaveProperty('role');
  });
});

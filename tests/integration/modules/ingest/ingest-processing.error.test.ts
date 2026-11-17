import { describe, expect, test } from 'vitest';

describe('IngestProcessingError', () => {
  test('preserves the 500-shaped error contract for unexpected ingest runtime failures', async () => {
    const { IngestProcessingError } =
      await import('../../../../app/modules/ingest/infrastructure/processing/ingest-processing.error');

    const error = new IngestProcessingError('Video processing failed: ffmpeg missing');

    expect(error).toMatchObject({
      message: 'Video processing failed: ffmpeg missing',
      name: 'IngestProcessingError',
      statusCode: 500,
    });
  });
});

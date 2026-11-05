import { describe, expect, test } from 'vitest';
import { normalizeVideoTags } from '~/modules/library/domain/video-tag';
import { parseIngestJobMetadata } from '../application/use-cases/manage-ingest-jobs.usecase';
import { ingestJobMetadataSchema } from './ingest-job';

describe('Ingest metadata tag boundary', () => {
  test('uses the canonical edit/UI policy for Unicode labels and idempotency hashes', () => {
    const tags = ['가족', '가족'.normalize('NFD'), 'C++', 'CAFÉ', 'cafe\u0301', 'old_tag'];
    const first = parseIngestJobMetadata({ title: 'Video', tags });
    const second = parseIngestJobMetadata({
      title: 'Video',
      tags: ['old_tag', 'café', 'c++', '가족'],
    });
    expect(first.metadata.tags).toEqual(normalizeVideoTags(tags));
    expect(first.requestHash).toBe(second.requestHash);
    expect(ingestJobMetadataSchema.parse({ title: 'Video' }).tags).toEqual([]);
  });
  test('accepts 100 Unicode code points even when their UTF-16 representation is longer', () => {
    expect(
      ingestJobMetadataSchema.parse({ title: 'Video', tags: ['😀'.repeat(100)] }).tags,
    ).toEqual(['😀'.repeat(100)]);
  });
  test.each(
    [
      null,
      'label',
      [42],
      [''],
      ['bad\u0000tag'],
      ['\ud800'],
      ['가'.repeat(101)],
      Array.from({ length: 101 }, (_, i) => `tag ${i}`),
    ].map((tags) => ({ tags })),
  )('rejects invalid upload tags %j rather than removing them', ({ tags }) => {
    expect(() => parseIngestJobMetadata({ title: 'Video', tags })).toThrow();
  });
});

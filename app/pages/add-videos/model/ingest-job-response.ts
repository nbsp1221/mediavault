import { z } from 'zod';
import { ingestJobViewSchema } from '~/modules/ingest/domain/ingest-job-view';

export const ingestJobMutationResponseSchema = z.object({
  error: z.string().optional(),
  job: ingestJobViewSchema.optional(),
  success: z.boolean(),
});

export const ingestJobListResponseSchema = z.object({
  jobs: z.array(ingestJobViewSchema).optional(),
  success: z.boolean(),
});

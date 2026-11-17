import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());

/** Keep integration-test response data unknown until its object boundary is validated. */
export async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  return jsonObjectSchema.parse(body);
}

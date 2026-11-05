import { z } from 'zod';
import { HttpError } from '@opsdeck/shared';

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  url: z.string().url(),
  owner: z.string().trim().min(1).max(80),
  environment: z.enum(['dev', 'staging', 'prod']).default('dev'),
  version: z.string().trim().max(40).optional(),
});

export const serviceUpdateSchema = serviceSchema.partial();

export function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new HttpError(400, 'validation_failed', result.error.flatten().fieldErrors);
  }
  return result.data;
}

/**
 * Meetings SoR block — configuration only. The renderer reads upcoming
 * meetings from the meetings table at render time, filtered by time window.
 */
import { z } from 'zod';
import { emptyTextSchema, sorLimitSchema } from './types';

export const meetingsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(10),
    timeWindowDays: z.number().int().min(1).max(365).default(30),
    /** Replaces the renderer's built-in empty copy when there are no rows. */
    emptyText: emptyTextSchema.optional(),
  })
  .strict();

export type MeetingsBlockContent = z.infer<typeof meetingsBlockSchema>;

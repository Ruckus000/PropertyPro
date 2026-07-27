/**
 * Announcements SoR block — configuration only. Renderer pulls published,
 * non-expired announcements from the announcements table at render time.
 */
import { z } from 'zod';
import { emptyTextSchema, sorLimitSchema } from './types';

export const announcementsBlockSchema = z
  .object({
    limit: sorLimitSchema.default(5),
    timeWindowDays: z.number().int().min(1).max(365).default(30),
    /** Replaces the renderer's built-in empty copy when there are no rows. */
    emptyText: emptyTextSchema.optional(),
  })
  .strict();

export type AnnouncementsBlockContent = z.infer<typeof announcementsBlockSchema>;

/**
 * Shared schemas and types for the support access feature.
 */
import { z } from 'zod';

/** Body schema for POST /api/admin/support/sessions */
export const CreateSessionSchema = z.object({
  communityId: z.number().int().positive(),
  targetUserId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

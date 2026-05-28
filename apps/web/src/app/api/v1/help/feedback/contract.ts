/**
 * Route contracts for `/api/v1/help/feedback`.
 *
 * Plan A1 drain #109. GET reads current user's article rating; POST upserts
 * thumbs up/down feedback with optional Sentry telemetry on negative comments.
 *
 * GET/POST both use `resolveEffectiveCommunityId` after Zod validation.
 * Response: loose `z.unknown()` — service rows include `updatedAt: Date`.
 *
 * `permission` metadata is placeholder (`settings`) — route has no RBAC gate;
 * any community member may submit feedback.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const articleSlugSchema = z.string().min(1).max(200);

export const getHelpFeedbackContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/feedback',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
      articleSlug: articleSlugSchema,
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'read' },
});

export const postHelpFeedbackContract = defineRoute({
  method: 'POST',
  path: '/api/v1/help/feedback',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      articleSlug: articleSlugSchema,
      articleCategory: z.string().min(1).max(100),
      rating: z.union([z.literal(1), z.literal(-1)]),
      comment: z.string().max(2000).optional().nullable(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});

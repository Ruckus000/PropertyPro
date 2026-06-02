/**
 * Route contract for `POST /api/v1/pm/bulk/announcements`.
 *
 * Plan A1 drain #168. PM cross-community bulk announcement broadcast.
 *
 * Authorization: session-anchored PM gate (`isPmAdminInAnyCommunity`) runs
 * inside the handler; contract permission metadata is placeholder only.
 *
 * Response `{ results: BulkResult[] }` is single-wrapped by the runner as
 * `{ data: { results } }` — already canonical after B1 Slice 3; hook unwraps
 * `.data.results` manually.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bulkAnnouncementAudienceSchema = z.enum([
  'all',
  'owners_only',
  'board_only',
  'tenants_only',
]);

export const pmBulkAnnouncementsPostBodySchema = z.object({
  communityIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one community is required'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be 500 characters or fewer'),
  body: z.string().min(1, 'Body is required'),
  audience: bulkAnnouncementAudienceSchema.default('all'),
  isPinned: z.boolean().default(false),
});

const bulkResultSchema = z.object({
  communityId: z.number(),
  communityName: z.string(),
  status: z.enum(['sent', 'failed']),
  error: z.string().optional(),
});

export const pmBulkAnnouncementsPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/bulk/announcements',
  request: {
    body: pmBulkAnnouncementsPostBodySchema,
  },
  response: z.object({
    results: z.array(bulkResultSchema),
  }),
  permission: { resource: 'settings', action: 'write' },
});

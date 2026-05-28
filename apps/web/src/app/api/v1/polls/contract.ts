/**
 * Route contracts for `/api/v1/polls` — GET (paginated list) + POST (create).
 *
 * Plan A1 drain #95. Migrated from the pre-migration `withErrorHandler`
 * handlers in `./route.ts`.
 *
 * GET auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId)
 *     → requireCommunityMembership
 *     → requirePollsEnabled (sync)
 *     → requirePollReadPermission (sync)
 *     → paginatePollsForCommunity({ ..., isActive, includeEnded, now })
 *
 * `isActive` and `includeEnded` are intentionally NOT in the Zod query
 * schema — the handler reads them from `URL.searchParams` via
 * `parseBooleanQuery` (defaults: `isActive=true`, `includeEnded=false`) to
 * preserve the pre-migration boolean parsing semantics (`'true' | '1'`).
 *
 * GET response: `paginated: true` with per-item `z.unknown()` (loose).
 * `PollRecord` carries `Date` fields (`createdAt`, `updatedAt`, optional
 * `endsAt`); a tight per-item schema would `safeParse`-fail before
 * `NextResponse.json` ISO-serializes them (drain #14/#62 precedent).
 * Wire envelope remains the canonical double-wrap:
 *   `{ data: { data: PollRecord[], pagination } }`.
 *
 * POST auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requirePollsEnabled (sync)
 *     → requirePollWritePermission (sync)
 *     → requirePollCreatorRole (sync)
 *     → createPollForCommunity(..., requestId)
 *
 * POST response: loose `z.unknown()` for the same Date-field reason.
 *
 * `permission` metadata matches runtime gates: `polls`/`read` (GET) and
 * `polls`/`write` (POST). `polls` is in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const listQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const createPollBodySchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  pollType: z.enum(['single_choice', 'multiple_choice']),
  options: z.array(z.string().trim().min(1).max(240)).min(2).max(20),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type CreatePollBody = z.infer<typeof createPollBodySchema>;

export const pollsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/polls',
  request: {
    query: listQuerySchema,
  },
  response: z.unknown(),
  paginated: true,
  permission: { resource: 'polls', action: 'read' },
});

export const pollsCreateContract = defineRoute({
  method: 'POST',
  path: '/api/v1/polls',
  request: {
    body: createPollBodySchema,
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'write' },
});

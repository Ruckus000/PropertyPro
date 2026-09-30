/**
 * Contracts for /api/v1/move-checklists/[id].
 *
 * Plan A1 drain #19. Two contracts per file — GET (params + query) and POST
 * (params + body) — exported separately so the GET and POST handlers each
 * consume the right shape. Mirrors drain #13 (payments/fee-policy) for the
 * two-contracts shape, and drain #11 (polls/[id]/my-vote) for the
 * params+query plumbing.
 *
 * GET — fetch a single move checklist by id. Path param: `[id]`. Query:
 *   `communityId`. Auth: authenticated user + community membership + admin
 *   role gate (`isAdminRole`). Service: `getMoveChecklist` (returns
 *   `MoveChecklist | null` — route surfaces 404 on null).
 *
 * POST — complete a move checklist. Path param: `[id]`. Body:
 *   `{ communityId }`. Auth: authenticated user + community membership +
 *   admin role gate. Service: `completeChecklist` (throws if any steps are
 *   incomplete; route surfaces that as the runner's default 500 → service
 *   error path, unchanged from pre-migration since the underlying service
 *   throws plain `Error` not `ValidationError`).
 *
 * Response modeling: loose `z.unknown()` for both contracts. The
 * `MoveChecklist` shape carries `Date` fields (`createdAt`, `updatedAt`,
 * `completedAt: Date | null`) plus a freeform `checklistData` record. The
 * runner's `safeParse` runs BEFORE `NextResponse.json` serializes (drain
 * #9/#14 lesson), so a tight `z.string()` on Date columns would 500 every
 * happy-path call. The consumer hook (`use-move-checklists.ts`) carries its
 * own `MoveChecklistRow` TS type that pins the wire shape on the client
 * side.
 *
 * `permission: { resource: 'move_checklists', action: 'read' | 'update' }`
 * is metadata only — `move_checklists` is NOT in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`), and the runner does not enforce
 * this field. The route's effective gate is the inline `isAdminRole(role)`
 * check after `requireCommunityMembership`. Matches the placeholder
 * convention from drain #4 (community/contact) for resources outside the
 * RBAC matrix.
 *
 * Behavior change vs. pre-migration:
 *   - GET/POST: invalid path/query/body 400 envelopes now carry the runner's
 *     canonical `VALIDATION_ERROR` shape (was hand-constructed
 *     `ValidationError` with a single message or formatZodErrors). Status
 *     codes unchanged.
 *
 * Tenant scope: GET declares `tenantScope: { in: 'query' }`, POST
 * `tenantScope: { in: 'body' }`. The app-bound runner (`@/lib/api/run-route`)
 * reconciles the explicit `communityId` against the middleware
 * `x-community-id` header (header authoritative) and injects it into the
 * handler. Delta: a header/explicit mismatch is 404, and — because the runner
 * resolves before the handler — it is returned before the 401. Missing/invalid
 * `communityId` was already a pre-auth runner 400, so that ordering is
 * unchanged.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const getMoveChecklistContract = defineRoute({
  method: 'GET',
  path: '/api/v1/move-checklists/[id]',
  request: {
    params: paramsSchema,
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'move_checklists', action: 'read' },
  tenantScope: { in: 'query' },
});

export const completeMoveChecklistContract = defineRoute({
  method: 'POST',
  path: '/api/v1/move-checklists/[id]',
  request: {
    params: paramsSchema,
    body: z.object({
      communityId: z.number().int().positive('Community ID must be a positive integer'),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'move_checklists', action: 'update' },
  tenantScope: { in: 'body' },
});

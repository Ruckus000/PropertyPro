/**
 * Route contract for `POST /api/v1/elections/[id]/cancel`.
 *
 * Plan A1 drain #45. Sibling precedent: drain #42
 * (`POST /api/v1/elections/[id]/open`, PR #446) — identical 7-gate auth chain
 * (requireAuthenticatedUserId → resolveEffectiveCommunityId → assertNotDemoGrace
 * → requireCommunityMembership → requireElectionsEnabled → requirePermission
 * 'elections','write' → requireElectionsAdminRole). This drain ADDS one
 * required body field `canceledReason` (trimmed, 1..500 chars) and passes a
 * SEPARATE object arg `{ canceledReason }` to the service.
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` is now expressed as
 * Zod body validation + `resolveEffectiveCommunityId(req, body.communityId)`
 * inside the handler. `parsePositiveInt('election id')` is now expressed via
 * Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `cancelElectionForCommunity` returns a service value that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid election cancel payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsCancelContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/cancel',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      canceledReason: z.string().trim().min(1).max(500),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});

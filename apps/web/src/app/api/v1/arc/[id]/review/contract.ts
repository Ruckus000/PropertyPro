/**
 * Route contract for `PATCH /api/v1/arc/[id]/review`.
 *
 * Plan A1 drain #64. ARC (Architectural Review Committee) submission review
 * endpoint — admin-facing write operation that records reviewer notes against
 * a submission. Sibling to drain #51 (`/arc/[id]/decide`); auth chain is
 * structurally identical (same two-`requirePermission`-gate shape and ARC
 * feature-flag + review-permission gates), only the method (PATCH vs. POST)
 * and body schema differ (no `decision` enum here — just `reviewNotes`).
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireArcEnabled (ASYNC — MUST await)
 *     → requirePermission('arc_submissions', 'read')
 *     → requirePermission('arc_submissions', 'write')
 *     → requireArcReviewPermission (sync — NOT awaited)
 *     → reviewArcSubmissionForCommunity(communityId, id, actorUserId,
 *         { reviewNotes }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('ARC submission id')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body fields:
 *   - `communityId`: positive int
 *   - `reviewNotes`: string ≤ 4000 chars, nullable + optional
 *
 * The `?? null` coercion on `reviewNotes` is preserved verbatim in the
 * handler — the service expects `null` (not `undefined`) for this field
 * (drain #46/#51 precedent).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `reviewArcSubmissionForCommunity` returns a service value (Drizzle row)
 * that carries `Date` fields; a tight `z.object({...})` schema would
 * `safeParse`-fail against real Date instances before `NextResponse.json`
 * ISO-serializes them (drain #14/#18/#20/#32/#42/#46/#50/#51 precedent).
 *
 * Permission gates: this route runs TWO `requirePermission` calls in series
 * — `arc_submissions.read` then `arc_submissions.write`. Per corpus convention
 * (drain #51), the contract's `permission` field declares the WRITE gate
 * (the more restrictive of the two). `arc_submissions` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid ARC review payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const arcReviewContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/arc/[id]/review',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
      reviewNotes: z.string().max(4000).nullable().optional(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'write' },
});

/**
 * Route contract for `POST /api/v1/arc/[id]/decide`.
 *
 * Plan A1 drain #51. ARC (Architectural Review Committee) submission decide
 * endpoint — admin-facing write operation that records an approve/deny
 * decision against a pending ARC submission. Closest precedent for the
 * `?? null` body coercion on `reviewNotes` is drain #46 certify (PR #450);
 * auth chain structurally matches drain #45-46 minus the elections-admin
 * gate, plus an ARC-feature-flag check and an ARC-review-permission gate.
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
 *     → decideArcSubmissionForCommunity(communityId, id, actorUserId,
 *         { decision, reviewNotes }, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('ARC submission id')` is now
 * expressed via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Body fields:
 *   - `communityId`: positive int
 *   - `decision`: 'approved' | 'denied'
 *   - `reviewNotes`: string ≤ 4000 chars, nullable + optional
 *
 * The `?? null` coercion on `reviewNotes` is preserved verbatim in the
 * handler — the service expects `null` (not `undefined`) for this field
 * (drain #46 precedent).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `decideArcSubmissionForCommunity` returns a service value (Drizzle row)
 * that carries `Date` fields; a tight `z.object({...})` schema would
 * `safeParse`-fail against real Date instances before `NextResponse.json`
 * ISO-serializes them (drain #14/#18/#20/#32/#42/#46/#50 precedent).
 *
 * `permission: { resource: 'arc_submissions', action: 'write' }` matches
 * the (stricter) runtime `requirePermission(membership, 'arc_submissions',
 * 'write')` call. The handler also calls `requirePermission(...,
 * 'arc_submissions', 'read')` immediately prior; per corpus convention the
 * contract's `permission` field declares the WRITE gate (the more
 * restrictive of the two). `arc_submissions` IS in `RBAC_RESOURCES`
 * (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid ARC decision payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const arcDecideContract = defineRoute({
  method: 'POST',
  path: '/api/v1/arc/[id]/decide',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z
      .object({
        communityId: z.number().int().positive(),
        decision: z.enum(['approved', 'denied']),
        reviewNotes: z.string().max(4000).nullable().optional(),
      })
      // HB 1203: an ARC/ACC denial must state the specific reason and identify
      // the rule or covenant relied on. Until the 2026-08-09 feature-correctness
      // audit this endpoint accepted `{ decision: 'denied' }` with no notes at
      // all and then emailed the resident an unexplained denial. The statute's
      // *content* requirement (citing the covenant) cannot be machine-checked;
      // requiring a non-empty written reason is the part that can.
      .superRefine((value, ctx) => {
        if (value.decision !== 'denied') return;
        if (value.reviewNotes != null && value.reviewNotes.trim().length > 0) return;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reviewNotes'],
          message:
            'A denial must include written reasons citing the specific rule or covenant relied on (HB 1203).',
        });
      }),
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'write' },
});

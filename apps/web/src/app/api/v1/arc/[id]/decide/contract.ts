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
 *   - `reviewNotes`: string ≤ 4000 chars, nullable + optional ON APPROVAL,
 *     REQUIRED AND NON-EMPTY ON DENIAL (see below)
 *   - `ruleReference`: string ≤ 500 chars, same rule — the structured citation
 *
 * The `?? null` coercion on `reviewNotes` is preserved verbatim in the
 * handler — the service expects `null` (not `undefined`) for this field
 * (drain #46 precedent).
 *
 * ── Denial requires a written reason ──────────────────────────────────────
 *
 * HB 1203 (2024) amended §720.3035: an architectural-review denial must be in
 * writing and must state the specific rule or covenant relied on. Before this
 * refinement a board could deny an owner's application with an empty reason
 * field, which is the statutory defect itself — not a UI nicety. The
 * `superRefine` below enforces it SERVER-SIDE, so a client that omits the
 * field (or sends whitespace) gets a 400 rather than a silently-empty denial.
 *
 * Approvals are deliberately left optional — the statute's writing requirement
 * attaches to denials.
 *
 * NOTE: this is a deliberate BREAKING change to the request contract, unlike
 * the byte-identical drain migrations described above. A denial that previously
 * returned 200 with `reviewNotes: null` now returns 400 VALIDATION_ERROR.
 * See docs/audits/2026-08-09-legal-risk-audit.md F-03.
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
        ruleReference: z.string().max(500).nullable().optional(),
      })
      .superRefine((value, ctx) => {
        if (value.decision !== 'denied') return;
        // Whitespace is not a reason. `?.trim()` also covers null/undefined.
        if (!value.reviewNotes?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reviewNotes'],
            message:
              'A written reason is required to deny an application. State the specific rule or covenant the application does not satisfy (Fla. Stat. §720.3035).',
          });
        }
        // Separate issue, separate field. Prose in `reviewNotes` can satisfy a
        // reader without ever naming the rule; the statute asks for the rule.
        if (!value.ruleReference?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ruleReference'],
            message:
              'Cite the specific rule or covenant relied on to deny this application (Fla. Stat. §720.3035) — for example "Declaration Art. VII §3" or "Architectural Guidelines §2.4".',
          });
        }
      }),
  },
  response: z.unknown(),
  permission: { resource: 'arc_submissions', action: 'write' },
});

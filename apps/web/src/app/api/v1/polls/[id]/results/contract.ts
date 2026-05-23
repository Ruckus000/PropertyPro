/**
 * Route contract for `GET /api/v1/polls/[id]/results`.
 *
 * Plan A1 drain #14 — direct clone of drain #11 (polls/[id]/my-vote)
 * shape; differs only in the service call (poll-results aggregate vs.
 * the actor's own vote). Same params+query input, same multi-gate
 * polls auth chain (feature-flag + RBAC read).
 *
 * Note on header/query reconciliation: the pre-migration route used
 * `parseCommunityIdFromQuery(req)` which ALREADY delegates to
 * `resolveEffectiveCommunityId` internally
 * (`apps/web/src/lib/finance/request.ts:17`). Header/query mismatch was
 * therefore ALREADY a 404 pre-migration — this migration introduces NO
 * 400→404 behavior delta on that axis. The only wire change is the 400
 * body shape (canonical VALIDATION_ERROR envelope) for invalid path id
 * / missing communityId.
 *
 * Authorization: tenant-scoped + feature-flag-gated + RBAC-checked.
 * `permission: { resource: 'polls', action: 'read' }` is the canonical
 * RBAC matrix coordinate (`polls` IS a real `RBAC_RESOURCES` entry —
 * `packages/shared/src/rbac-matrix.ts`). The runner does NOT enforce
 * this today; the actual gates remain in the route handler:
 *   - `requirePollsEnabled(membership)`   — feature-flag gate.
 *   - `requirePollReadPermission(membership)` — RBAC gate.
 *
 * Response shape: loose-aggregate `z.unknown()` per drain #8 philosophy.
 * Rationale:
 *   1. `PollResults` from `polls-service` is a shape-rich aggregate
 *      `{ poll: PollRecord; totalVotes: number; options: Array<{...}> }`
 *      where `PollRecord` carries `endsAt: Date|null`, `createdAt: Date`,
 *      and `updatedAt: Date` fields. The runner's `safeParse(result)`
 *      runs BEFORE `NextResponse.json` serializes Dates to ISO strings
 *      (drain #9 lesson), so any tight `z.string()` schema for those
 *      fields would reject the live `Date` values without an explicit
 *      `.transform()` / coercion ladder.
 *   2. `PollRecord` declares an open `[key: string]: unknown` index
 *      signature, meaning the TypeScript surface is intentionally
 *      additive — a tight contract would 500 on benign field additions.
 *   3. The route does NO projection / transformation; the service
 *      return value is passed through verbatim. There is no value-add
 *      to re-asserting the shape at the contract boundary.
 *   4. Consumer-side `useBoardPollResults` (and friends) in
 *      `apps/web/src/hooks/use-board.ts` pins the wire shape via its
 *      own TypeScript type — that is the source of truth for UI
 *      consumers. The `contract_violation: response` Sentry canary
 *      still fires on structural breakage at the runner level.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const pollResultsContract = defineRoute({
  method: 'GET',
  path: '/api/v1/polls/[id]/results',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'polls', action: 'read' },
});

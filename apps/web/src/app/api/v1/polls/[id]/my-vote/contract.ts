/**
 * Route contract for `GET /api/v1/polls/[id]/my-vote`.
 *
 * Plan A1 drain #11 — mirrors drain #3 (ledger/balance/[unitId])
 * params+query shape with a different multi-gate auth chain
 * (polls-enabled + poll-read-permission instead of finance-enabled +
 * owner-vs-staff branching). `id` lives in the URL path segment and is
 * validated via `z.coerce.number().int().positive()`; `communityId`
 * comes from the query string.
 *
 * Authorization: tenant-scoped + feature-flag-gated + RBAC-checked. The
 * `permission: { resource: 'polls', action: 'read' }` is the canonical
 * RBAC matrix coordinate (`polls` IS a real `RBAC_RESOURCES` entry —
 * `packages/shared/src/rbac-matrix.ts:44`). The runner does NOT enforce
 * this today; the actual gates remain in the route handler:
 *   - `requirePollsEnabled(membership)`   — feature-flag gate.
 *   - `requirePollReadPermission(membership)` — RBAC gate.
 *
 * Response shape: `PollMyVote` from `polls-service` =
 *   `{ hasVoted: boolean; selectedOptions: string[] }`. Tightly modeled
 * (single object, no nullability) — the service always returns an
 * object, using `{ hasVoted: false, selectedOptions: [] }` when the user
 * has not voted (NOT `null`). Documented here so future evolutions of
 * the service signature (e.g., switching to a nullable union) require
 * touching the contract.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Response schema mirrors `PollMyVote` exactly. `selectedOptions` is a
 * list of option ids (strings — see `mapVoteRow` in polls-service).
 */
export const pollMyVoteResponseSchema = z.object({
  hasVoted: z.boolean(),
  selectedOptions: z.array(z.string()),
});

export type PollMyVoteResponse = z.infer<typeof pollMyVoteResponseSchema>;

export const pollMyVoteContract = defineRoute({
  method: 'GET',
  path: '/api/v1/polls/[id]/my-vote',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: pollMyVoteResponseSchema,
  permission: { resource: 'polls', action: 'read' },
});

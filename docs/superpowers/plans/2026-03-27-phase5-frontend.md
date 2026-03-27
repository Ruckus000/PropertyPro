# Phase 5 Frontend Implementation Plan

> Restored and corrected on 2026-03-27. This plan uses the historical Phase 5 frontend plan from commit `7bc217f` and the design spec from commit `b6a7d6b` as inputs, but replaces the stale implementation details that no longer match the current repo.

## Summary

- Keep the recovered Phase 5 architecture: Board routes live under `/communities/[id]/board/{polls,forum,elections}` and Operations lives under `/communities/[id]/operations` with query-param tab state.
- Treat this document as the execution plan. The historical Phase 5 plan is baseline context only.
- Resolve the highest-risk gaps before implementation starts: election submission model, server-side gating, audit payload policy, bounded operations APIs, reservation-cancel semantics, and concurrency/idempotency rules.
- Roll out in two increments:
  - Increment 1: contracts, schema dependencies, admin gate, operations hub, nav changes
  - Increment 2: elections backend + board elections UI behind the attorney-review gate

## Baseline Architecture

- Use Server Components for page shells and auth/context resolution.
- Use Client Components for interactive Board and Operations views with TanStack Query hooks.
- Keep the service → API route → hook → component chain for elections.
- Keep Board as filesystem tabs and Operations as a single page with `?tab=` state.
- Add `/communities/[id]/board/layout.tsx` to resolve membership, features, and community-level gating once per board route.
- Redirect the legacy maintenance page to `/communities/[id]/operations?tab=requests`. Do not use `?type=request` as the canonical tab state.
- Emit redirect analytics for the maintenance move and show a temporary in-app notice for users who land on the old maintenance route.

## Required Corrections

### 1. Source of Truth Alignment

- Treat the recovered historical plan as a structure reference, not as a literal code template.
- Use app runtime constants in `apps/web/src/lib/constants/status.ts` and `apps/web/src/lib/constants/empty-states.ts` as the implementation source of truth.
- Do not update `docs/design-system/constants/*` in Phase 5. Update runtime constants only.
- Reuse existing APIs and services where they already exist. Do not create duplicate vendors, amenities, or reservations routes just because they appeared as “new files” in the recovered historical plan.

### 2. Elections Gating, Shared Types, and Admin Workflow

- Do not add a new `hasElections` static feature flag. Keep `hasVoting` as the only shared capability flag for elections in `packages/shared/src/features/types.ts` and `packages/shared/src/features/community-features.ts`.
- Add `electionsAttorneyReviewed?: boolean` to `communities.communitySettings` in `packages/db/src/schema/communities.ts`.
- Expose `electionsAttorneyReviewed` through the admin app PATCH schema and community settings editor so platform admins can toggle the gate.
- Do not expose the full `communitySettings` object through tenant-facing membership/context types.
- Extend `CommunityMembership` with a narrow allowlisted field only:
  - `electionsAttorneyReviewed: boolean`
- Implement `requireElectionsEnabled()` in `apps/web/src/lib/elections/common.ts` so it checks both:
  - `features.hasVoting`
  - `membership.electionsAttorneyReviewed === true`
- Enforce the elections gate in all three places:
  - Board nav/tab visibility
  - Server-rendered elections page shells
  - Every `/api/v1/elections/*` route and elections service entrypoint before any DB access
- When a platform admin changes `electionsAttorneyReviewed`, the admin route must emit a dedicated audited settings change using `settings_changed` with metadata identifying the setting name, old value, and new value.
- Admin changes to `electionsAttorneyReviewed` must invalidate any cached membership/settings reads so the Board UI does not remain stale until hard refresh.
- Only platform admins may toggle `electionsAttorneyReviewed`. The admin UI must describe this as a legal readiness gate, not as a generic feature toggle.

### 3. RBAC, Guards, and Audit Policy

- Add `'elections'` to `RBAC_RESOURCES` in `packages/shared/src/rbac-matrix.ts`.
- Update the explicit RBAC matrix entries in `packages/shared/src/rbac-matrix.ts`. Do not use the recovered historical plan’s nonexistent `extendPolicy` approach.
- Keep RBAC actions to `read` and `write` only. Open, close, certify, cancel, candidate management, and proxy approval remain `write` actions plus explicit admin-role guards.
- Create `apps/web/src/lib/elections/common.ts` by following `apps/web/src/lib/polls/common.ts`:
  - `requireElectionsEnabled`
  - `requireElectionsReadPermission`
  - `requireElectionsWritePermission`
  - `requireElectionsAdminRole`
- Keep all new elections and operations routes compliant with the current API route pattern:
  - wrap handlers in `withErrorHandler`
  - validate with Zod `.safeParse()`
  - use `parseCommunityIdFromQuery` for `GET` and `DELETE` routes
  - use `parseCommunityIdFromBody` for `POST` and `PATCH` routes
  - return these exact statuses:
    - `200` for reads and state transitions (`open`, `close`, `certify`, `cancel`, reservation cancel)
    - `201` for creates (`elections`, `candidates`, `proxies`, `vote`, `eligibility`)
    - `204` for deletes
  - call `logAuditEvent()` for every mutation
- Align all election mutations to the current audit logger contract:
  - `logAuditEvent({ userId, action, resourceType, resourceId, communityId, oldValues?, newValues?, metadata? })`
- Replace dotted audit actions from the recovered historical plan with underscore actions already supported by `packages/db/src/utils/audit-logger.ts`:
  - `election_created`
  - `election_updated`
  - `election_opened`
  - `election_closed`
  - `election_certified`
  - `election_canceled`
  - `ballot_cast`
  - `proxy_designated`
  - `proxy_approved`
  - `proxy_rejected`
  - `proxy_revoked`
- Candidate add/remove and manual eligibility snapshot remain standalone mutations in Phase 5. Extend `AuditAction` in the same change with:
  - `election_candidate_added`
  - `election_candidate_removed`
  - `election_eligibility_snapshotted`
- Election audit payload policy is explicit:
  - never log vote selections
  - never log candidate ID arrays for ballots
  - never log unit IDs in `oldValues`, `newValues`, or `metadata`
  - never log proxy holder identity in election audit metadata unless the action is a proxy lifecycle event and the field is already the resource identity
  - never log raw ballot rows, raw eligibility rows, or `voterHash`
  - `ballot_cast` logs one record per logical submission with counts and flags only
- Fire-and-forget audit logging is forbidden for elections. Election mutations must use one of these two patterns:
  - domain mutation + audit row in the same transaction
  - domain mutation + transactional outbox entry in the same transaction, with asynchronous audit delivery

### 4. Elections Backend: Submission Model, Transactions, and Read Boundaries

- Import schema tables and types from the public `@propertypro/db` exports.
- Import operators from `@propertypro/db/filters`.
- Use `createScopedClient()` for all tenant-scoped election routes and services.
- Match the existing elections schema exactly where it remains in place:
  - `status` uses `canceled`, not `cancelled`
  - use `quorumPercentage`
  - use `maxSelections`
  - use `totalBallotsCast`
  - use `resultsDocumentId`
  - use `canceledReason`
  - use `ballotSalt`
  - use `createdByUserId`

#### 4.1 Pre-flight Schema Dependency

- Replace the historical “small abstention follow-up” with a required pre-flight schema change before any vote route is implemented.
- Add a new append-only table named `election_ballot_submissions` with these columns:
  - `id`
  - `communityId`
  - `electionId`
  - `unitId`
  - `submittedByUserId`
  - `submissionFingerprint`
  - `voterHash`
  - `isAbstention`
  - `isProxyVote`
  - `proxyId`
  - `submittedAt`
- Add a unique index on `election_ballot_submissions (electionId, unitId)` so one unit can have only one logical submission per election.
- Add `submissionId` to `election_ballots` as a required foreign key to `election_ballot_submissions`.
- Keep `election_ballots.candidateId` non-null and use it only for selected candidates.
- Abstentions create one `election_ballot_submissions` row and zero `election_ballots` rows.
- `totalBallotsCast` increments from successful `election_ballot_submissions` inserts only.
- `my-vote` reads from `election_ballot_submissions`, not from grouped `election_ballots`.
- This migration path assumes there are no live production customer ballot rows before Phase 5 launch.
- Before enabling elections in any environment, verify `election_ballots` and `election_ballot_submissions` contain zero production customer rows.
- If non-zero production rows exist, stop rollout and create a separate backfill plan before continuing.

#### 4.2 Vote Submission Rules

- Vote submission must run in one DB transaction.
- Vote submission must be idempotent for client retries.
- Duplicate-vote prevention must be enforced by the database, not only by a pre-read check.
- Vote submission must:
  - reject any unit that already has a submission header for the election
  - insert one selection row per selected candidate when not abstaining
  - create one abstention submission without inventing a placeholder candidate
  - increment `totalBallotsCast` once per logical submission
  - enforce approved proxy status before any proxy vote is accepted
  - generate `voterHash` from `ballotSalt`, not from raw `actorUserId`
- `ballot_cast` must emit one audit event per logical submission, not per candidate row.

#### 4.3 State Transitions and Read Boundaries

- `open`, `close`, `certify`, and `cancel` are explicit admin mutations.
- State transitions must be concurrency-safe and idempotent:
  - conditional update on current status
  - repeated close/certify/cancel requests become harmless no-ops
- `my-vote` may only return the current actor’s own voting receipt/status:
  - `hasVoted`
  - `submittedAt`
  - `submissionFingerprint`
  - `viaProxy`
  - `electionStatus`
- `my-vote` must never return candidate mappings or raw ballot row data.
- Keep raw ballot rows behind sealed service/repository APIs. No route may expose them directly.
- Keep results aggregate-only. No route may return unit-to-candidate mappings.
- Count abstentions toward quorum, but exclude them from candidate totals.
- Results queries, quorum checks, and duplicate-vote checks must be DB-side, not in-memory aggregation in Node.
- Add/verify the indexes needed for results and duplicate-vote checks before shipping the results UI.

### 5. Operations, Reservations, and Data Minimization

- Do not recreate vendor or amenity CRUD from scratch.
- Reuse current vendor routes:
  - `GET /api/v1/vendors`
  - `POST /api/v1/vendors`
  - `PATCH /api/v1/vendors/[id]`
- Vendor deletion is out of scope in Phase 5. Vendors are deactivated through `PATCH /api/v1/vendors/[id]` with `isActive=false`.
- Reuse current amenities routes instead of inventing nested replacements.
- Do not rely on `DELETE /api/v1/reservations/[id]?communityId=...` as the canonical cancellation contract.
- Reservation cancellation must use a dedicated transition route:
  - `POST /api/v1/reservations/[id]/cancel`
- Reservation cancellation must:
  - derive tenant scope server-side from the authenticated membership/scoped client
  - verify the reservation belongs to the current community inside the transaction
  - preserve reservation history as canceled state, not hard-delete it
  - emit an audit event

#### 5.1 Operations API Shape

- `GET /api/v1/operations` exists only for the All tab.
- `GET /api/v1/operations` returns a minimal, paginated merged list with:
  - `cursor`
  - `limit`
  - `type?`
  - `status?`
  - `priority?`
  - `unitId?`
- Hard max page size: 50.
- The All-tab DTO must be field-minimized:
  - no resident names by default
  - no vendor contact details
  - no free-text notes/descriptions beyond what is required for summary display
  - no hidden admin-only fields
- Detailed records stay on domain-specific detail endpoints with explicit authorization.
- Requests and Work Orders tabs continue using their own domain endpoints.
- Do not add tab badge counts in Phase 5. Tab labels are static text only.
- Define bounded failure behavior for operations aggregation:
  - per-source timeouts
  - no unbounded lookback windows
  - if one source fails or times out, return `200` with available items, `partialFailure=true`, and `unavailableSources[]`
  - if both sources fail, return `503`
- All upstream queries used by operations aggregation must use server-side scoped context only. Raw `communityId` passthrough at the aggregation boundary is forbidden.

### 6. Hooks, UI States, and Performance Bounds

- Hooks must follow the TanStack Query structure from `apps/web/src/hooks/use-meetings.ts`, but do not copy its invalidation strategy literally.
- Define feature keys at three levels where applicable:
  - summary
  - list
  - detail
- Mutations must invalidate the narrowest affected keys first.
- Domain-root invalidation is allowed only for genuinely cross-cutting writes.
- Set `staleTime` explicitly for read-mostly data like elections lists, vendors, amenities, and status summaries.
- Use these exact pagination/limit rules:
  - elections list: max 25 per page
  - proxies list: max 25 per page
  - forum threads list: max 50 per page
  - operations merged list: max 50 per page
  - vendors list: max 50 per page
  - reservations list: max 25 per page
  - amenity schedule window: max 7 calendar days per request
- Every new Board and Operations view must handle:
  - loading with Skeletons
  - empty with `EmptyState`
  - error with danger `AlertBanner`
  - success with normal rendered content
- Status rendering must use `getStatusConfig()` from `apps/web/src/lib/constants/status.ts`.
- Add missing election and work-order statuses to the runtime status constant instead of hard-coded color mappings.
- `getStatusConfig()` consumers must handle unknown statuses with a neutral fallback so mixed-version deploys do not break badges.
- Use semantic tokens only for spacing and color.
- Mark decorative icons as `aria-hidden="true"`.

### 7. Product, Support, and Rollout Guardrails

- The elections rollout is blocked until all of the following are true:
  - submission-model migration is complete
  - backward-compatible reads are deployed
  - server-side elections gates are live
  - audit payload redaction rules are implemented
  - concurrency/idempotency tests pass
  - attorney review is enabled for the target community
- Provide an owner-safe vote receipt/confirmation UX using the `my-vote` receipt shape.
- Add support-safe diagnostics for election issues that do not expose vote selections.
- Update support/internal docs for:
  - maintenance nav move
  - elections attorney-review gate
  - vote receipt troubleshooting
  - proxy approval troubleshooting

## Public Interface Changes

- `packages/db/src/schema/communities.ts`
  - add `communitySettings.electionsAttorneyReviewed?: boolean`
- `apps/web/src/lib/api/community-membership.ts`
  - add `electionsAttorneyReviewed: boolean`
  - do not expose full `communitySettings`
- `packages/shared/src/rbac-matrix.ts`
  - add `'elections'` resource
- `packages/db/src/utils/audit-logger.ts`
  - keep underscore election actions
  - extend with candidate and eligibility snapshot actions
- `GET /api/v1/operations`
  - bounded merged list for All tab only
- `POST /api/v1/reservations/[id]/cancel`
  - canonical reservation cancel transition
- `GET /api/v1/elections/[id]/my-vote`
  - returns receipt/status only, never selections

## Tests and Acceptance Criteria

- Add guard tests for elections enabled/disabled behavior, including `hasVoting=true` with `electionsAttorneyReviewed=false`.
- Add route tests proving every elections route enforces the server-side gate.
- Add role-matrix tests for elections read/write routes across owner, tenant, admin, and gate-off states.
- Add route tests for each new elections mutation using the existing `vi.hoisted()` pattern.
- Cover validation failure, forbidden access, happy path, and audit logging in route tests.
- Add concurrency tests for:
  - duplicate vote submission
  - close/certify double-submit
  - proxy approval/revocation double-submit
- Add migration tests for the submission-model change:
  - old row shape
  - new row shape
  - mixed-read compatibility during rollout
- Add voting tests for:
  - multi-select ballots
  - abstentions
  - duplicate-vote rejection
  - proxy approval enforcement
  - `totalBallotsCast` incrementing once per logical submission
- Add results tests proving:
  - quorum includes abstentions
  - candidate totals exclude abstentions
  - secret-ballot responses never expose unit-linked vote data
  - audit payloads do not contain selections/unit identifiers
- Add hook tests for elections and operations cache keys, targeted invalidation, and URLs.
- Add operations tests for:
  - page-size caps
  - cursor behavior
  - field minimization
  - partial-source failure handling
  - cross-tenant isolation
- Add reservation cancellation tests proving:
  - tenant scope is server-derived
  - cancellation preserves history
  - unauthorized community swapping fails
- Add UI tests for:
  - query-param tab persistence
  - maintenance redirect to `?tab=requests`
  - hidden elections tab when attorney review is off
  - loading, empty, error, and success states for major panels
  - stale gate refresh after admin toggle invalidation

## Explicit Non-Goals

- Do not create a new `hasElections` feature flag.
- Do not expose the full `communitySettings` blob through tenant-facing membership/context APIs.
- Do not import schema tables from internal package paths in app code.
- Do not use dotted audit actions like `election.created`.
- Do not model abstentions with fake candidate rows.
- Do not aggregate large elections or operations result sets in Node memory when a DB-side aggregate can answer the query.
- Do not add duplicate amenities, vendors, or reservations endpoints when an existing route already covers the behavior.

## Assumptions

- The recovered historical plan is the correct baseline architecture, and the corrections above supersede any conflicting implementation detail in that document.
- `hasVoting` remains the shared feature flag for condo/HOA voting.
- `electionsAttorneyReviewed` is a per-community runtime gate, not a new shared feature flag.
- Candidate add/remove and manual eligibility snapshot remain separate mutations in Phase 5.
- The All tab is summary-only. Clicking an item deep-links into the existing maintenance request detail or work-order detail flow instead of introducing a new merged detail API.

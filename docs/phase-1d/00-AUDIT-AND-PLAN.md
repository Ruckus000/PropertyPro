# Phase 1D: E-Voting — Audit & Implementation Plan

**Date:** 2026-03-16
**Branch:** `phase-1d/e-voting`
**Statutory Scope:** Florida §718.128 (condos) and §720.317 (HOAs)
**Timeline:** Weeks 7-10 (per roadmap)
**Ship Gate:** 1D.6 — 8 success criteria + BLOCKING attorney review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Infrastructure Audit](#2-infrastructure-audit)
3. [Gap Analysis](#3-gap-analysis)
4. [Schema Design](#4-schema-design)
5. [Implementation Plan](#5-implementation-plan)
6. [Risk Register](#6-risk-register)
7. [Ship Gate Checklist](#7-ship-gate-checklist)

---

## 1. Executive Summary

Phase 1D extends the existing `polls` and `poll_votes` tables into a full statutory e-voting system compliant with Florida §718.128 (condo electronic voting) and §720.317 (HOA electronic voting). The existing infrastructure supports basic community polls (single/multiple choice). Statutory elections require fundamentally different data models and workflows.

### Key Distinction: Polls vs. Elections

| Concern | Existing Polls | Statutory Elections (Phase 1D) |
|---|---|---|
| **Vote unit** | Per user | Per unit (one vote per unit, regardless of how many owners) |
| **Ballot secrecy** | Votes fully attributable | Secret ballot required for board elections |
| **Proxy support** | None | Owner can designate a proxy voter |
| **Quorum** | None | Minimum participation threshold required |
| **Eligibility** | Any community member | Owners only, optionally "in good standing" |
| **Result certification** | Simple percentage display | Certified PDF with quorum verification, timestamps, signatures |
| **Audit trail** | Basic audit log entry | Immutable, tamper-evident vote log |
| **Types** | Generic single/multiple choice | Board election, budget approval, rule amendment, special assessment |

**Recommendation:** Build elections as a **separate domain** (new tables, new service, new API routes) rather than overloading the existing polls system. Polls remain as lightweight community engagement; elections are statutory instruments with legal weight.

---

## 2. Infrastructure Audit

### 2.1 What Exists (Green)

#### Database Schema

| Table | File | Purpose | Reusable for 1D? |
|---|---|---|---|
| `polls` | `packages/db/src/schema/polls.ts` | Basic poll definitions (title, type, options as JSONB array, ends_at) | **No** — options model is too simple for candidate management |
| `poll_votes` | `packages/db/src/schema/poll-votes.ts` | User votes (unique per user+poll, selected_options JSONB) | **No** — keyed on user_id, not unit_id; no secret ballot support |

**Schema details (polls):**
- `id` (bigserial PK), `community_id` (FK), `title`, `description`
- `poll_type` (`single_choice` | `multiple_choice`)
- `options` (jsonb string array — flat list, no candidate metadata)
- `ends_at` (nullable timestamp), `is_active` (boolean)
- `created_by_user_id`, standard timestamps + soft delete

**Schema details (poll_votes):**
- `id` (bigserial PK), `community_id` (FK), `poll_id` (FK), `user_id` (FK)
- `selected_options` (jsonb string array)
- Unique constraint: `(poll_id, user_id)` — per-user, NOT per-unit
- No `deleted_at` — votes are immutable (good pattern to keep)

#### API Routes (3 endpoints)

| Route | Method | Handler |
|---|---|---|
| `/api/v1/polls` | GET | List polls (filter by isActive, includeEnded) |
| `/api/v1/polls` | POST | Create poll (admin only via `requirePollCreatorRole`) |
| `/api/v1/polls/[id]/vote` | POST | Cast vote (any member with polls.write) |
| `/api/v1/polls/[id]/results` | GET | Get results (vote counts + percentages) |

#### Service Layer

**File:** `apps/web/src/lib/services/polls-service.ts` (583 lines)

Key functions:
- `createPollForCommunity()` — Creates poll with option validation
- `castPollVoteForCommunity()` — Casts vote with duplicate detection (409 on retry)
- `getPollResultsForCommunity()` — Aggregates votes into counts + percentages
- `listPollsForCommunity()` — Lists with active/ended filters

Utility functions (potentially reusable):
- `normalizePollOptions()` — Trim/deduplicate
- `validateVoteSelection()` — Validate selected options exist in poll
- `parseOptionalEndDate()` — Date parsing

#### Permission Helpers

**File:** `apps/web/src/lib/polls/common.ts`

- `requirePollsEnabled()` — Checks `hasPolls` feature flag
- `requirePollReadPermission()` / `requirePollWritePermission()` — RBAC checks
- `requirePollCreatorRole()` — Admin-only gate
- All community types have `hasPolls: true`

#### RLS Policies

- `polls`: `tenant_crud` policy family
- `poll_votes`: `tenant_user_scoped` (immutable, actor-scoped SELECT/INSERT)

#### Integration Tests

**File:** `apps/web/__tests__/integration/polls-community-board.integration.test.ts` (208 lines)

Covers: create poll → vote → duplicate vote (409) → results verification + cross-tenant isolation.

#### RBAC Matrix

All roles have `polls.read: true` and `polls.write: true`. Poll creation further gated to admins in route handler.

### 2.2 Adjacent Infrastructure (Available for Reuse)

| System | Location | Relevance to 1D |
|---|---|---|
| **Audit logging** | `compliance_audit_log` table + `logAuditEvent()` | Vote audit trail — log every vote cast/proxy designated |
| **PDF generation** | `apps/web/src/lib/services/finance-service.ts` (`exportStatementPdf()`) | Pattern for certified results PDF |
| **Email templates** | `packages/email/src/templates/` | Vote confirmation email, election announcement |
| **Feature flags** | `packages/shared/src/features/community-features.ts` | Need new `hasElections` flag |
| **RBAC matrix** | `packages/shared/src/rbac-matrix.ts` | Need new `elections.*` permissions |
| **Document storage** | Documents system with categories | Archive certified results as official documents |
| **Units table** | `packages/db/src/schema/units.ts` | Unit-based vote enforcement |
| **Community members** | `community_members` table | Owner identification, good-standing checks |

---

## 3. Gap Analysis

### 3.1 Critical Gaps (Must Build)

| # | Gap | Statutory Requirement | Severity |
|---|---|---|---|
| G1 | **No election entity** | Elections are distinct from polls — different lifecycle, types, eligibility rules | P0 |
| G2 | **No unit-based voting** | §718.128: one vote per unit, not per user. Multi-owner units get one vote | P0 |
| G3 | **No secret ballot** | §718.128: board elections must support secret ballot (vote recorded but not attributable to voter) | P0 |
| G4 | **No proxy voting** | §718.128: owners can designate proxies; proxy holder votes on their behalf | P0 |
| G5 | **No quorum tracking** | §718.128: election not valid without quorum (typically 30% of eligible units) | P0 |
| G6 | **No candidate management** | Board elections need candidate profiles, not flat string options | P1 |
| G7 | **No certified results PDF** | Legal record of election outcome with quorum verification | P1 |
| G8 | **No eligibility engine** | Only owners in good standing should vote; need "good standing" definition | P1 |
| G9 | **No election UI** | Zero frontend pages for election management or voting | P1 |
| G10 | **No vote receipt/confirmation** | Voter must receive confirmation (email + in-portal) | P2 |
| G11 | **No "abstain" option** | Voters should be able to abstain (counts toward quorum but not vote totals) | P2 |
| G12 | **No election announcement workflow** | Notify eligible voters when election opens | P2 |

### 3.2 Architectural Decisions Required

| Decision | Options | Recommendation | Rationale |
|---|---|---|---|
| **D1: Separate tables vs. extend polls** | (a) New `elections` + `election_votes` tables (b) Add columns to `polls` + `poll_votes` | **(a) Separate tables** | Polls are lightweight community engagement. Elections are legal instruments with fundamentally different invariants (unit-scoped, quorum, secrecy). Mixing them creates a "god table" with nullable columns and confusing branching logic. |
| **D2: Secret ballot implementation** | (a) Null user_id on vote rows (b) Separate `election_ballots` table with encrypted voter identity (c) Hash-based approach: store hash(user_id + salt) for audit without attribution | **(c) Hash-based** | Option (a) loses audit trail. Option (b) adds encryption complexity. Option (c) allows proving a specific user voted (for duplicate prevention) without revealing *how* they voted when results are queried. Store `voter_hash` for uniqueness + `unit_id` for counting, omit `user_id` from the ballot row for secret elections. |
| **D3: Quorum calculation** | (a) Count of eligible units at election creation time (snapshot) (b) Real-time count of eligible units | **(a) Snapshot at creation** | Units can transfer during an election. The quorum denominator must be fixed at election creation to prevent gaming. Store `eligible_unit_count` on the election row. |
| **D4: Good standing definition** | (a) No overdue assessments (b) Admin manually flags (c) Configurable per election | **(c) Configurable** | Some associations define "good standing" differently. Let the admin choose: "all owners" or "owners with no overdue assessments >60 days". Store the rule on the election. |
| **D5: Proxy designation** | (a) In-app form with admin approval (b) Upload scanned proxy form | **(a) In-app with admin approval** | Digital-first, auditable, better UX. Proxy form upload can be a future enhancement. |
| **D6: Election types** | Board election, budget approval, rule amendment, special assessment approval, custom | All five | Per roadmap spec. Each type may have slightly different ballot layouts but share the same core voting engine. |

---

## 4. Schema Design

### 4.1 New Tables

#### `elections`
```
id                    BIGSERIAL PK
community_id          BIGINT FK → communities (CASCADE)
title                 TEXT NOT NULL
description           TEXT
election_type         TEXT NOT NULL ('board_election' | 'budget_approval' | 'rule_amendment' | 'special_assessment' | 'custom')
status                TEXT NOT NULL DEFAULT 'draft' ('draft' | 'open' | 'closed' | 'certified' | 'cancelled')
is_secret_ballot      BOOLEAN NOT NULL DEFAULT false
quorum_type           TEXT NOT NULL DEFAULT 'percentage' ('percentage' | 'count')
quorum_threshold      INTEGER NOT NULL DEFAULT 30  -- percentage or absolute count
eligible_unit_count   INTEGER  -- snapshot at open time
eligibility_rule      TEXT NOT NULL DEFAULT 'all_owners' ('all_owners' | 'good_standing')
good_standing_days    INTEGER DEFAULT 60  -- overdue threshold for good_standing rule
opens_at              TIMESTAMPTZ NOT NULL
closes_at             TIMESTAMPTZ NOT NULL
certified_at          TIMESTAMPTZ
certified_by_user_id  UUID FK → users
certified_document_id BIGINT FK → documents  -- link to archived PDF
created_by_user_id    UUID FK → users (SET NULL)
created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
deleted_at            TIMESTAMPTZ
```

#### `election_candidates`
```
id                BIGSERIAL PK
community_id      BIGINT FK → communities (CASCADE)
election_id       BIGINT FK → elections (CASCADE)
display_name      TEXT NOT NULL
bio               TEXT
photo_url         TEXT
sort_order        INTEGER NOT NULL DEFAULT 0
is_write_in       BOOLEAN NOT NULL DEFAULT false
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Used only for `board_election` type. For other types, options are stored directly on the election or as simple text choices.

#### `election_options`
```
id                BIGSERIAL PK
community_id      BIGINT FK → communities (CASCADE)
election_id       BIGINT FK → elections (CASCADE)
label             TEXT NOT NULL  -- "Yes", "No", "Approve $X special assessment", etc.
description       TEXT
sort_order        INTEGER NOT NULL DEFAULT 0
candidate_id      BIGINT FK → election_candidates (SET NULL)  -- links to candidate for board elections
created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Unified option model — for board elections, each option links to a candidate. For budget/rule votes, options are standalone (e.g., "Approve" / "Reject").

#### `election_ballots`
```
id                BIGSERIAL PK
community_id      BIGINT FK → communities (CASCADE)
election_id       BIGINT FK → elections (CASCADE)
unit_id           BIGINT FK → units (CASCADE)
voter_hash        TEXT NOT NULL  -- SHA-256(user_id + election_id + server_salt)
is_proxy_vote     BOOLEAN NOT NULL DEFAULT false
proxy_id          BIGINT FK → election_proxies (SET NULL)
is_abstention     BOOLEAN NOT NULL DEFAULT false
selected_option_ids BIGINT[] NOT NULL DEFAULT '{}'  -- references election_options.id
cast_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
ip_address        TEXT  -- for audit trail (hashed or masked)
user_agent        TEXT  -- for audit trail

UNIQUE(election_id, unit_id)  -- ONE vote per unit per election
```

**Secret ballot design:**
- `voter_hash` proves a specific user voted (prevents double-voting) without revealing identity
- `unit_id` is always stored (needed for quorum counting and one-vote-per-unit enforcement)
- For non-secret elections, the service layer can additionally log user_id in the audit log
- For secret elections, user_id is NEVER written to the ballot row or any queryable column

#### `election_proxies`
```
id                    BIGSERIAL PK
community_id          BIGINT FK → communities (CASCADE)
election_id           BIGINT FK → elections (CASCADE)
granting_user_id      UUID FK → users (CASCADE)  -- the owner designating the proxy
granting_unit_id      BIGINT FK → units (CASCADE)
proxy_holder_user_id  UUID FK → users (CASCADE)  -- the person voting on their behalf
scope                 TEXT NOT NULL DEFAULT 'full' ('full' | 'specific_options')
specific_instructions TEXT  -- if scope is specific_options, what to vote for
status                TEXT NOT NULL DEFAULT 'pending' ('pending' | 'approved' | 'rejected' | 'revoked')
approved_by_user_id   UUID FK → users (SET NULL)
approved_at           TIMESTAMPTZ
created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE(election_id, granting_unit_id)  -- one proxy per unit per election
```

### 4.2 Indexes

```sql
-- Election queries
CREATE INDEX idx_elections_community_status ON elections(community_id, status, opens_at DESC);
CREATE INDEX idx_elections_community_dates ON elections(community_id, opens_at, closes_at);

-- Candidate/option lookups
CREATE INDEX idx_election_candidates_election ON election_candidates(election_id, sort_order);
CREATE INDEX idx_election_options_election ON election_options(election_id, sort_order);

-- Ballot queries (results tabulation)
CREATE INDEX idx_election_ballots_election ON election_ballots(election_id, is_abstention);
CREATE INDEX idx_election_ballots_unit ON election_ballots(election_id, unit_id);

-- Proxy lookups
CREATE INDEX idx_election_proxies_election ON election_proxies(election_id, status);
CREATE INDEX idx_election_proxies_holder ON election_proxies(proxy_holder_user_id, election_id);
```

### 4.3 RLS Policies

| Table | Policy | Notes |
|---|---|---|
| `elections` | `tenant_crud` | Admin create/update, all members read |
| `election_candidates` | `tenant_crud` | Admin manage, all members read |
| `election_options` | `tenant_crud` | Admin manage, all members read |
| `election_ballots` | `tenant_user_scoped` (custom) | INSERT: voter or proxy holder; SELECT: admin sees all (non-secret) or aggregates only (secret) |
| `election_proxies` | `tenant_user_scoped` (custom) | INSERT/SELECT: granting user, proxy holder, or admin |

---

## 5. Implementation Plan

### Overview

```
Week 7 ──────────────────────────────────────────────
  WS-1: Schema + Migrations + RLS              [3 days]
  WS-2: Election Service + API Routes           [4 days]

Week 8 ──────────────────────────────────────────────
  WS-3: Election Management UI (Admin)          [4 days]
  WS-4: Proxy Voting Workflow                   [2 days]

Week 9 ──────────────────────────────────────────────
  WS-5: Voting UI (Owner)                       [4 days]
  WS-6: Results, Certification & PDF            [3 days]

Week 10 ─────────────────────────────────────────────
  WS-7: Email Notifications + Automation        [2 days]
  WS-8: Integration Testing + Ship Gate         [3 days]
```

---

### WS-1: Schema, Migrations & RLS (3 days)

**Role perspective: Senior Engineer + DevOps**

#### Tasks

| # | Task | Details | Acceptance |
|---|---|---|---|
| 1.1 | Create migration file | `0043_create_elections.sql` (verify next available migration number). Create all 5 tables with constraints, indexes, and RLS policies. | Tables exist in DB, RLS enforced |
| 1.2 | Create Drizzle schema files | `elections.ts`, `election-candidates.ts`, `election-options.ts`, `election-ballots.ts`, `election-proxies.ts` in `packages/db/src/schema/` | Types export, schema compiles |
| 1.3 | Export from schema index | Add all new tables to `packages/db/src/schema/index.ts` | No import errors |
| 1.4 | Add RLS config entries | Add 5 entries to `rls-config.ts` with appropriate policy families | Guard passes |
| 1.5 | Add feature flag | Add `hasElections: true` for `condo_718` and `hoa_720`, `false` for `apartment` in community-features.ts | Feature gating works |
| 1.6 | Add RBAC permissions | Add `elections.read`, `elections.write`, `elections.certify` to RBAC matrix. Certify = board_president + cam + property_manager_admin only | Matrix updated |

**DevOps considerations:**
- Verify migration number doesn't collide (memory says last is 0036 on main, but Phase 5 used 0066+; check branch state)
- Migration must be idempotent (use `IF NOT EXISTS` where possible)
- RLS policies must handle the secret ballot case — admin SELECT on ballots must NOT return voter_hash for secret elections

**Chaos Engineering considerations:**
- What if migration runs twice? (idempotent)
- What if tables exist from a failed partial migration? (use transactions)

---

### WS-2: Election Service + API Routes (4 days)

**Role perspective: Senior Engineer**

#### Service: `apps/web/src/lib/services/election-service.ts`

| Function | Description |
|---|---|
| `createElection()` | Create draft election with options/candidates. Validate opens_at < closes_at, quorum > 0. |
| `updateElection()` | Update draft elections only. Cannot modify open/closed elections. |
| `openElection()` | Transition draft → open. Snapshot `eligible_unit_count` at this moment. Validate at least 2 options. |
| `closeElection()` | Transition open → closed. Prevent new votes. Triggered manually or by cron when closes_at passes. |
| `certifyElection()` | Transition closed → certified. Generate PDF, store as document, record certifier. Requires quorum met. |
| `cancelElection()` | Transition any status → cancelled. Requires reason (audit logged). |
| `castBallot()` | Core voting function. Enforce: election is open, voter is eligible owner (or approved proxy holder), unit hasn't voted, voter_hash is unique. |
| `getElectionResults()` | Aggregate ballots by option. For secret elections: return counts only, no voter info. For non-secret: include unit-level breakdown. |
| `getEligibleUnits()` | Query units with at least one owner. Apply good-standing filter if configured. |
| `getQuorumStatus()` | Current ballots cast / eligible_unit_count. Returns { met: boolean, current: number, required: number }. |
| `getVoterStatus()` | For a given user + election: has their unit voted? Are they the designated voter? Do they have a proxy? |

#### Permission Helpers: `apps/web/src/lib/elections/common.ts`

| Function | Description |
|---|---|
| `requireElectionsEnabled()` | Check `hasElections` feature flag |
| `requireElectionReadPermission()` | RBAC: `elections.read` |
| `requireElectionWritePermission()` | RBAC: `elections.write` (admin only) |
| `requireElectionCertifyPermission()` | RBAC: `elections.certify` (board_president, cam, pm_admin) |
| `requireElectionVotePermission()` | Must be owner (or approved proxy holder) with eligible unit |

#### API Routes

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/v1/elections` | GET | List elections (filter: status, upcoming) | elections.read |
| `/api/v1/elections` | POST | Create election (draft) | elections.write |
| `/api/v1/elections/[id]` | GET | Get election details + options/candidates | elections.read |
| `/api/v1/elections/[id]` | PATCH | Update draft election | elections.write |
| `/api/v1/elections/[id]` | DELETE | Soft-delete (draft only) | elections.write |
| `/api/v1/elections/[id]/open` | POST | Transition draft → open | elections.write |
| `/api/v1/elections/[id]/close` | POST | Transition open → closed | elections.write |
| `/api/v1/elections/[id]/certify` | POST | Certify + generate PDF | elections.certify |
| `/api/v1/elections/[id]/cancel` | POST | Cancel election | elections.write |
| `/api/v1/elections/[id]/vote` | POST | Cast ballot | Owner/proxy |
| `/api/v1/elections/[id]/results` | GET | Get results (respects secret ballot) | elections.read |
| `/api/v1/elections/[id]/quorum` | GET | Get quorum status | elections.read |
| `/api/v1/elections/[id]/my-status` | GET | Voter's own eligibility + vote status | Authenticated owner |
| `/api/v1/elections/[id]/proxies` | GET | List proxies for election | elections.write |
| `/api/v1/elections/[id]/proxies` | POST | Submit proxy designation | Owner |
| `/api/v1/elections/[id]/proxies/[proxyId]/approve` | POST | Approve/reject proxy | elections.write |

**Chaos Engineering considerations:**
- Race condition: two owners of same unit vote simultaneously → unique constraint on `(election_id, unit_id)` catches this; service returns 409
- Clock skew: server time vs. opens_at/closes_at → always use DB `NOW()` for comparisons, never client time
- What if `eligible_unit_count` is 0? → Prevent opening election with 0 eligible units

---

### WS-3: Election Management UI — Admin (4 days)

**Role perspective: UX/UI + Frontend Engineer**

#### Pages

| Page | Route | Purpose |
|---|---|---|
| Election List | `/dashboard/elections` | List all elections with status badges, filters (draft/open/closed/certified) |
| Create Election | `/dashboard/elections/new` | Wizard: type → details → options/candidates → eligibility → quorum → review → create |
| Election Detail | `/dashboard/elections/[id]` | View election, manage candidates, monitor voting progress, certify results |

#### Components (in `apps/web/src/components/elections/`)

| Component | Purpose |
|---|---|
| `election-list.tsx` | Table with status badge, type, dates, actions (open/close/certify) |
| `election-wizard.tsx` | Multi-step form: type selection → details → options → settings → preview |
| `election-type-selector.tsx` | Card-based type picker (board election, budget approval, etc.) |
| `candidate-manager.tsx` | Add/remove/reorder candidates with name, bio, photo upload |
| `option-manager.tsx` | Add/remove/reorder options for non-election types |
| `eligibility-settings.tsx` | Toggle: all owners vs. good standing; configure days threshold |
| `quorum-settings.tsx` | Percentage vs. count input with preview ("X of Y units") |
| `election-status-badge.tsx` | Color-coded status pill (draft=gray, open=green, closed=yellow, certified=blue) |
| `election-progress.tsx` | Real-time voting progress: ballots cast / eligible, quorum bar |
| `proxy-management-table.tsx` | List pending/approved proxies with approve/reject actions |
| `results-viewer.tsx` | Bar chart + table of results. Secret ballot: counts only. Non-secret: unit breakdown. |
| `ballot-preview.tsx` | Preview what voters will see before publishing |

#### UX Considerations

- **Wizard flow:** Don't overwhelm admin with all fields at once. Step-by-step with clear progress indicator.
- **Ballot preview:** WYSIWYG preview of the ballot as voters will see it. Critical for reducing admin errors.
- **Real-time progress:** WebSocket or polling for live vote count during open elections. Polling every 30s is sufficient.
- **Certification flow:** Explicit confirmation dialog: "By certifying these results, you confirm the election was conducted in accordance with your association's bylaws and Florida law." Requires board_president or cam role.
- **Mobile responsive:** Admin dashboard is primarily desktop, but should not break on tablet.

---

### WS-4: Proxy Voting Workflow (2 days)

**Role perspective: UX/UI + Senior Engineer**

#### Owner Flow
1. Owner navigates to election detail → "I can't vote in person / Designate Proxy"
2. Form: Select proxy holder (dropdown of community members OR enter name/email)
3. Choose scope: "Vote on all matters" or "Vote as follows: [instructions]"
4. Submit → proxy status = `pending`
5. Owner receives confirmation email
6. Owner can revoke proxy before it's used

#### Admin Flow
1. Admin sees pending proxies on election detail page → "Proxies" tab
2. Review: granting owner, proxy holder, scope
3. Approve or reject with optional notes
4. On approval, proxy holder is notified via email

#### Proxy Holder Voting Flow
1. Proxy holder logs in → election page shows "You are a proxy for Unit [X]"
2. Proxy holder votes as normal, selecting options
3. Ballot is recorded with `is_proxy_vote = true`, `proxy_id` linked
4. Granting owner is notified that their proxy was used

#### Edge Cases (Chaos Engineering)
- Owner votes, then tries to also designate proxy → blocked (unit already voted)
- Proxy holder votes for their own unit AND proxy unit → allowed (two separate ballots, two separate units)
- Owner revokes proxy after proxy holder already voted → too late, vote stands (immutable)
- Proxy holder is not a community member → rejected at submission
- Two owners of same unit both try to designate proxies → unique constraint on `(election_id, granting_unit_id)`

---

### WS-5: Voting UI — Owner (4 days)

**Role perspective: UX/UI + Frontend Engineer + Chaos Engineering**

#### Pages

| Page | Route | Purpose |
|---|---|---|
| Active Elections | `/dashboard/elections` (reuse) | Owner sees active elections they can vote in |
| Vote | `/dashboard/elections/[id]/vote` | Ballot presentation + confirmation |
| Confirmation | `/dashboard/elections/[id]/confirmation` | Post-vote receipt |

#### Voting Flow UX

1. **Election list:** Owner sees elections with status: "Vote Now" (green), "Voted" (checkmark), "Closed" (gray), "Coming Soon" (calendar icon)
2. **Ballot page:**
   - Clear election title and description
   - For board elections: candidate cards with name, bio, photo
   - For budget/rule votes: option cards with description
   - "Abstain" checkbox at bottom
   - Mobile-first layout (many owners will vote on phones)
3. **Confirmation screen (pre-submit):**
   - "You are voting for: [selections]"
   - "This vote is for Unit [X] and cannot be changed after submission."
   - "By submitting, you confirm you are authorized to vote for this unit."
   - Clear "Submit Vote" and "Go Back" buttons
4. **Receipt screen (post-submit):**
   - "Your vote has been recorded."
   - Confirmation number (ballot ID hash)
   - "A confirmation email has been sent to [email]"
   - Link to view election results (if non-secret and results are published)

#### Components (in `apps/web/src/components/elections/`)

| Component | Purpose |
|---|---|
| `ballot-form.tsx` | Core voting form with option selection + abstain |
| `candidate-card.tsx` | Candidate display with photo, name, bio |
| `option-card.tsx` | Generic option display for non-election votes |
| `vote-confirmation-dialog.tsx` | "Are you sure?" modal with vote summary |
| `vote-receipt.tsx` | Post-vote confirmation with receipt number |
| `election-card.tsx` | Card for election list with status + action button |
| `eligibility-notice.tsx` | Banner: "You are eligible to vote" / "Your unit has already voted" / "You are not eligible" |
| `proxy-banner.tsx` | "You are voting as proxy for Unit [X] on behalf of [Owner Name]" |

#### TanStack Query Hooks: `apps/web/src/hooks/use-elections.ts`

| Hook | Query Key | Endpoint |
|---|---|---|
| `useElections()` | `['elections', communityId]` | GET /elections |
| `useElection(id)` | `['elections', id]` | GET /elections/[id] |
| `useElectionResults(id)` | `['elections', id, 'results']` | GET /elections/[id]/results |
| `useQuorumStatus(id)` | `['elections', id, 'quorum']` | GET /elections/[id]/quorum |
| `useMyVoteStatus(id)` | `['elections', id, 'my-status']` | GET /elections/[id]/my-status |
| `useCastBallot()` | mutation | POST /elections/[id]/vote |
| `useCreateElection()` | mutation | POST /elections |
| `useSubmitProxy()` | mutation | POST /elections/[id]/proxies |

#### Chaos Engineering: Voting Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User double-clicks "Submit Vote" | Unique constraint `(election_id, unit_id)` → 409 on second request. UI disables button on first click + shows loading state. |
| User opens ballot in two tabs, submits both | First succeeds, second gets 409. Service handles gracefully. |
| Election closes mid-vote (user was on ballot page) | Submit returns 403 with message "Election has closed." UI shows helpful message. |
| User is not an owner (tenant role) | Ballot page shows "You are not eligible to vote in this election." |
| Unit has no owner (vacant) | Unit excluded from eligible count and ballot list. |
| User's token expires mid-vote | Standard auth middleware returns 401. UI redirects to login. After re-login, return to ballot (state preserved in URL). |
| Extremely long candidate list (20+ candidates) | Paginated or scrollable ballot with sticky submit button. |

---

### WS-6: Results, Certification & PDF (3 days)

**Role perspective: Senior Engineer + UX/UI**

#### Results Computation

```typescript
interface ElectionResults {
  election: ElectionSummary;
  quorum: { required: number; actual: number; met: boolean };
  totalBallots: number;
  totalAbstentions: number;
  options: Array<{
    id: number;
    label: string;
    candidateId?: number;
    voteCount: number;
    percentage: number;  // of non-abstention votes
  }>;
  // Only included for non-secret elections:
  unitBreakdown?: Array<{
    unitId: number;
    unitLabel: string;
    selectedOptionIds: number[];
    isProxy: boolean;
    castAt: string;
  }>;
}
```

#### Certified Results PDF

Content:
- Association name + logo (from branding)
- Election title, type, dates
- Quorum verification statement: "Quorum required: X units (Y%). Ballots received: Z units (W%). Quorum [WAS/WAS NOT] achieved."
- Results table: option → vote count → percentage
- For board elections: winner(s) highlighted
- Certification statement: "These results are certified by [Name], [Role], on [Date] at [Time]."
- Signature line (digital: certifier's name + role + timestamp)
- Audit statement: "Vote records are maintained in the association's electronic voting system in compliance with Florida Statute §718.128."

#### Document Archival
- After certification, PDF is uploaded to Supabase Storage
- A document record is created under the "Elections & Voting" category
- `certified_document_id` on the election row links to this document

---

### WS-7: Email Notifications + Automation (2 days)

**Role perspective: Senior Engineer + DevOps**

#### Email Templates (in `packages/email/src/templates/`)

| Template | Trigger | Recipient |
|---|---|---|
| `election-announcement.tsx` | Election opened | All eligible owners |
| `vote-confirmation.tsx` | Ballot cast | Voter (owner or proxy holder) |
| `proxy-designation.tsx` | Proxy submitted | Proxy holder + granting owner |
| `proxy-approved.tsx` | Admin approves proxy | Proxy holder + granting owner |
| `election-closing-reminder.tsx` | 48h before closes_at | Eligible owners who haven't voted |
| `election-results.tsx` | Election certified | All community members |

#### Cron Jobs

| Endpoint | Schedule | Purpose |
|---|---|---|
| `POST /api/v1/internal/election-closer` | `0 */1 * * *` (hourly) | Close elections where `closes_at < NOW()` and status = 'open' |
| `POST /api/v1/internal/election-reminders` | `0 10 * * *` (daily 10am) | Send 48h reminder to non-voters |

#### DevOps Considerations
- Vercel cron limits (Hobby: 2 total, Pro: unlimited)
- Consider combining with existing cron endpoints via a dispatcher pattern
- Rate limit email sends (batch, don't blast 500 emails at once)

---

### WS-8: Integration Testing + Ship Gate (3 days)

**Role perspective: Senior Engineer + Chaos Engineering + QA**

#### Test Suites

| Test File | Coverage |
|---|---|
| `election-lifecycle.integration.test.ts` | Create → open → vote → close → certify full lifecycle |
| `election-secret-ballot.test.ts` | Secret election: verify no voter identity leaks in results API |
| `election-quorum.test.ts` | Quorum met/not-met scenarios, certification blocked without quorum |
| `election-proxy.test.ts` | Proxy designation → approval → proxy voting → receipt |
| `election-unit-voting.test.ts` | Multi-owner unit: only one vote allowed; vacant unit excluded |
| `election-edge-cases.test.ts` | Double-vote, expired election, ineligible voter, cancelled election |
| `election-cross-tenant.test.ts` | Community A cannot see/vote in Community B elections |

#### Chaos Engineering Scenarios

| Scenario | Test Method |
|---|---|
| **Database connection drops mid-vote** | Transaction ensures atomicity. Vote either fully records or doesn't. No partial state. |
| **Election has 1000 eligible units** | Load test the results aggregation query. Index on `election_ballots(election_id)` handles this. |
| **Two elections open simultaneously** | Each has independent ballots. No cross-contamination. |
| **Admin certifies then tries to reopen** | State machine: certified → no transitions allowed (except to archived). |
| **Voter hash collision** | SHA-256 collision is astronomically unlikely. Use election_id + user_id + server_salt to further reduce risk. |
| **Time zone edge cases** | All timestamps stored as TIMESTAMPTZ. opens_at / closes_at compared with DB `NOW()`. No client-side time comparisons. |

---

## 6. Risk Register

| # | Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **Attorney review delays ship gate** | Cannot ship without §718.128 sign-off | High | Start attorney review in Week 7 (don't wait until Week 10). Share schema + ballot flow document early. | Project Lead |
| R2 | **"Good standing" definition varies by association** | Eligibility engine may not match bylaws | Medium | Make configurable per election (D4). Default to "all owners." | Senior Engineer |
| R3 | **Secret ballot leaks voter identity** | Legal liability | Low (if implemented correctly) | Hash-based approach (D2). Integration test: query results API for secret election, assert no user_id or voter_hash in response. | Senior Engineer + QA |
| R4 | **Proxy abuse** | Owner claims they didn't designate proxy | Low | In-app form creates audit trail. Email confirmation to granting owner. Admin approval required. | UX/UI |
| R5 | **Election results contested** | Board challenges results validity | Medium | Certified PDF includes quorum verification + timestamp + certifier identity. Audit log captures every action. | Senior Engineer |
| R6 | **Migration conflicts with other branches** | Schema collision | Low | Verify migration number before creating. Currently on branch-isolated work. | DevOps |
| R7 | **Apartment communities don't need elections** | Feature flag waste | Low | `hasElections: false` for apartment type. Feature flag already in architecture. Zero impact. | Senior Engineer |
| R8 | **Mobile voting UX is poor** | Low voter turnout → quorum not met | Medium | Mobile-first design. Test on iPhone SE (smallest common screen). Large touch targets. Minimal scrolling. | UX/UI |

---

## 7. Ship Gate Checklist (1D.6)

Per roadmap, all 8 criteria must pass before shipping:

| # | Criterion | Verification Method |
|---|---|---|
| SG1 | Board election can be created, conducted, and certified entirely in-platform | E2E integration test: create → open → vote (multiple units) → close → certify → PDF generated |
| SG2 | One vote per unit enforced | Test: two owners of same unit try to vote → second blocked (409). Test: unique constraint on (election_id, unit_id). |
| SG3 | Quorum tracking and automatic validation | Test: election with 10 eligible units, quorum 30%. After 2 votes: quorum not met. After 3 votes: quorum met. Certification blocked if quorum not met. |
| SG4 | Secret ballot functional for elections | Test: create secret election, cast votes, query results API. Assert: response contains vote counts but NO user_id, voter_hash, or unit-level breakdown. |
| SG5 | Proxy voting workflow complete | Test: owner designates proxy → admin approves → proxy holder votes → ballot shows is_proxy_vote=true → granting owner notified. |
| SG6 | Certified results PDF generates correctly | Test: certify election → document created in documents system → PDF downloadable → content includes quorum statement, results, certifier info. |
| SG7 | All votes logged with immutable audit trail | Test: compliance_audit_log has entries for every ballot cast, every proxy designation, every election state transition. Ballots have no deletedAt column (immutable). |
| SG8 | **BLOCKING: Attorney review of §718.128 compliance** | External: attorney reviews schema, ballot flow, secret ballot implementation, proxy workflow, certification PDF. Written sign-off required before shipping. |

---

## Appendix A: File Inventory

### New Files to Create

```
packages/db/src/schema/
  elections.ts
  election-candidates.ts
  election-options.ts
  election-ballots.ts
  election-proxies.ts

packages/db/migrations/
  XXXX_create_elections.sql

apps/web/src/lib/services/
  election-service.ts

apps/web/src/lib/elections/
  common.ts

apps/web/src/app/api/v1/elections/
  route.ts                          # GET (list), POST (create)
  [id]/route.ts                     # GET, PATCH, DELETE
  [id]/open/route.ts                # POST
  [id]/close/route.ts               # POST
  [id]/certify/route.ts             # POST
  [id]/cancel/route.ts              # POST
  [id]/vote/route.ts                # POST
  [id]/results/route.ts             # GET
  [id]/quorum/route.ts              # GET
  [id]/my-status/route.ts           # GET
  [id]/proxies/route.ts             # GET, POST
  [id]/proxies/[proxyId]/approve/route.ts  # POST

apps/web/src/app/api/v1/internal/
  election-closer/route.ts          # Cron
  election-reminders/route.ts       # Cron

apps/web/src/app/(authenticated)/elections/       # or /dashboard/elections
  page.tsx                          # Election list
  new/page.tsx                      # Creation wizard
  [id]/page.tsx                     # Election detail
  [id]/vote/page.tsx                # Ballot
  [id]/confirmation/page.tsx        # Vote receipt

apps/web/src/components/elections/
  election-list.tsx
  election-wizard.tsx
  election-type-selector.tsx
  candidate-manager.tsx
  option-manager.tsx
  eligibility-settings.tsx
  quorum-settings.tsx
  election-status-badge.tsx
  election-progress.tsx
  proxy-management-table.tsx
  results-viewer.tsx
  ballot-preview.tsx
  ballot-form.tsx
  candidate-card.tsx
  option-card.tsx
  vote-confirmation-dialog.tsx
  vote-receipt.tsx
  election-card.tsx
  eligibility-notice.tsx
  proxy-banner.tsx

apps/web/src/hooks/
  use-elections.ts

packages/email/src/templates/
  election-announcement.tsx
  vote-confirmation.tsx
  proxy-designation.tsx
  proxy-approved.tsx
  election-closing-reminder.tsx
  election-results.tsx

apps/web/__tests__/
  integration/election-lifecycle.integration.test.ts
  integration/election-secret-ballot.test.ts
  integration/election-quorum.test.ts
  integration/election-proxy.test.ts
  integration/election-unit-voting.test.ts
  integration/election-edge-cases.test.ts
  integration/election-cross-tenant.test.ts
```

### Files to Modify

```
packages/db/src/schema/index.ts                    # Export new tables
packages/db/src/schema/rls-config.ts               # Add 5 RLS entries
packages/shared/src/features/community-features.ts # Add hasElections
packages/shared/src/rbac-matrix.ts                 # Add elections.* permissions
packages/email/src/index.ts                        # Export new templates
apps/web/vercel.json                               # Add 2 cron jobs
apps/web/src/middleware.ts                          # Add election routes to protected paths (if needed)
apps/web/src/components/navigation/*               # Add Elections nav link
scripts/seed-demo.ts                               # Add election seed data
```

---

## Appendix B: Statutory Reference

### §718.128 — Electronic Voting (Condos)

Key requirements this implementation addresses:
1. Unit owners must consent to electronic voting (assumption: consent obtained during onboarding/portal signup)
2. Authentication of voter identity (voter_hash + session auth)
3. Ability to change vote before final submission (pre-submit confirmation screen)
4. Receipt of electronic ballot confirmation (email + in-portal receipt)
5. Secret ballot capability for elections (hash-based approach, no voter identity on ballot row)

### §720.317 — Electronic Voting (HOAs)

Similar requirements to §718.128, with HOA-specific adaptations:
1. Requires board resolution to adopt electronic voting
2. Members may opt out (need "I prefer to vote in person" option — addressed by not requiring electronic voting)
3. Same secret ballot and proxy requirements

**Note:** Attorney review (SG8) must confirm our implementation satisfies both statutes.

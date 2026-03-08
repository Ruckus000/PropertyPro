# Workstream 68: Polls and Community Board

**Complexity:** Small
**Tier:** 2 (expand)
**Migration Range:** 0066-0070
**Depends on:** WS 65 (RBAC resources, feature flags, test harness)

---

## 1. Objective And Business Outcome

Enable informal polling and community discussion forums for association members. These are engagement features, not governance (formal voting is out of scope).

---

## 2. In Scope

- Poll creation (single-choice, multiple-choice) with optional end date
- Vote casting and results display
- Community board/forum: threads with replies
- Moderation capabilities (pin, lock, delete threads)
- Role-based access for moderation

---

## 3. Out Of Scope

- Formal governance voting (quorum rules, proxy voting, ballot secrecy)
- Real-time chat or messaging
- File attachments in forum posts (text only for initial release)
- Poll templates or recurring polls

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| `polls` and `hasCommunityBoard` RBAC resources / flags | WS 65 | Must land first |
| `hasPolls` feature flag | WS 65 | Must land first |
| Test harness | WS 65 | Must land first |

---

## 5. Data Model And Migrations

### New Tables (migrations 0066-0070 range)

**polls** — Poll definitions
- id, communityId, title, description, pollType (single_choice/multiple_choice), options (JSONB array), endsAt, createdByUserId, isActive, createdAt, updatedAt, deletedAt

**poll_votes** — Individual votes
- id, communityId, pollId, userId, selectedOptions (JSONB array), createdAt
- UNIQUE(pollId, userId) — one vote per user per poll
- No `deletedAt`: votes are immutable once cast. Retracting a vote is not supported (prevents vote manipulation).

Votes are **immutable once cast**. The `POST /api/v1/polls/:id/vote` endpoint rejects requests if the user has already voted (409 Conflict). No UPDATE or DELETE is supported for votes. Rationale: mutable votes create governance disputes in association elections. If vote changing is needed in the future, it should be a new poll type with explicit audit trail, not a modification to this table.

**forum_threads** — Discussion threads
- id, communityId, title, body, authorUserId, isPinned, isLocked, createdAt, updatedAt, deletedAt

**forum_replies** — Thread replies
- id, communityId, threadId, body, authorUserId, createdAt, updatedAt, deletedAt

All tables: communityId FK, RLS enabled.

---

## 6. API Contracts

```
# Polls
POST   /api/v1/polls                   — Create poll
GET    /api/v1/polls                   — List polls
POST   /api/v1/polls/:id/vote         — Cast vote
GET    /api/v1/polls/:id/results      — Get results

# Forum
POST   /api/v1/forum/threads          — Create thread
GET    /api/v1/forum/threads          — List threads (paginated)
GET    /api/v1/forum/threads/:id      — Get thread with replies
POST   /api/v1/forum/threads/:id/reply — Add reply
PATCH  /api/v1/forum/threads/:id      — Pin/lock/edit (moderation)
DELETE /api/v1/forum/threads/:id      — Soft-delete (moderation)
```

---

## 7. Authorization + RLS Policy Family Mapping

### Polls

| Role | Create Poll | Vote | View Results | Close/Delete Poll |
|---|---|---|---|---|
| owner | no | yes | yes | no |
| tenant | no | yes | yes | no |
| board_member | yes | yes | yes | no |
| board_president | yes | yes | yes | yes |
| cam | yes | yes | yes | yes |
| site_manager | yes | yes | yes | yes |
| property_manager_admin | yes | yes | yes | yes |

### Forum / Community Board

| Role | Create Thread | Reply | View | Moderate (pin/lock/delete) |
|---|---|---|---|---|
| owner | yes | yes | yes | no |
| tenant | yes | yes | yes | no |
| board_member | yes | yes | yes | no |
| board_president | yes | yes | yes | yes |
| cam | yes | yes | yes | yes |
| site_manager | yes | yes | yes | yes |
| property_manager_admin | yes | yes | yes | yes |

### RLS Policy Families

- `polls` → `tenant_crud` (community-scoped, all members can read)
- `poll_votes` → `tenant_user_scoped` (users can only see/manage their own votes)
- `forum_threads` → `tenant_crud` (community-scoped, all members can read)
- `forum_replies` → `tenant_crud` (community-scoped, all members can read)

---

## 10. Testing Plan

### Seed Strategy
- Add 1-2 polls per community with pre-cast votes
- Add 1-2 forum threads with replies

### Teardown Rules
- Standard cascade delete; `poll_votes` has UNIQUE constraint, handle accordingly

### Tenant Isolation Matrix
- communityA polls/threads not visible to communityB
- Vote privacy: results aggregated, individual votes not exposed via API

### Concurrency Cases
- Two votes from same user → UNIQUE constraint prevents duplicate; return 409
- Vote after poll ends → reject with 422

### Environment Requirements
- `DATABASE_URL` only

### Required Test Coverage
- Poll lifecycle: create → vote → results (integration)
- Vote uniqueness enforcement (integration)
- Forum thread CRUD + replies (integration)
- Moderation permissions (integration)
- Cross-tenant isolation (integration)

---

## 12. Definition Of Done + Evidence Required

- [ ] Poll CRUD with voting and results
- [ ] Forum threads with replies and moderation
- [ ] No-mock integration tests
- [ ] Cross-tenant isolation tests
- [ ] RLS policies for all new tables
- [ ] Audit logging for mutations
- [ ] Feature flags (`hasPolls`, `hasCommunityBoard`) enforcement
- [ ] Evidence doc in `docs/audits/phase5-68-YYYY-MM-DD.md`

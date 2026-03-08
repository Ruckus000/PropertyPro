# Workstream 70: Calendar Sync and Accounting Connectors

**Complexity:** Medium
**Tier:** 3 (defer — assess after Tier 1 ships)
**Migration Range:** 0081-0085
**Depends on:** WS 65 (RBAC resources, feature flags, test harness), WS 66 (ledger entries for accounting export)

---

## 1. Objective And Business Outcome

Provide ICS calendar feeds for meetings, enable Google Calendar sync, and build accounting connector adapters for exporting financial data to third-party accounting systems (QuickBooks, Xero).

---

## 2. In Scope

- ICS feed generation for community meetings (public URL, per-user filtering)
- Google Calendar two-way sync for board/CAM users
- Accounting connector adapter interface
- QuickBooks Online connector (chart of accounts mapping, journal entry export)
- Xero connector (similar mapping)

---

## 3. Out Of Scope

- Apple Calendar push notifications (CalDAV)
- Real-time calendar sync (webhook-based push channels are Tier 3 stretch)
- Full accounting system integration (import from accounting system)
- Payroll or tax reporting

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| Meetings table | Existing (Phase 2) | Available |
| Ledger entries | WS 65 + WS 66 | WS 65 schema must land first |
| Google Calendar API credentials | Environment setup | Must provision |

---

## 5. Data Model And Migrations

### New Tables (migrations 0081-0085 range)

**calendar_sync_tokens** — Per-user sync state for Google Calendar
- id, communityId, userId, provider (google), accessToken (TEXT, AES-256-GCM encrypted at application layer), refreshToken (TEXT, AES-256-GCM encrypted at application layer), syncToken, channelId, channelExpiry, lastSyncAt, createdAt, updatedAt, deletedAt

**accounting_connections** — Per-community accounting system connections
- id, communityId, provider (quickbooks/xero), accessToken (TEXT, AES-256-GCM encrypted at application layer), refreshToken (TEXT, AES-256-GCM encrypted at application layer), tenantId, lastSyncAt, mappingConfig (JSONB), createdAt, updatedAt, deletedAt

### Token Encryption Strategy

OAuth tokens (access_token, refresh_token) are encrypted at the application layer before storage and decrypted on read.

- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key source:** `TOKEN_ENCRYPTION_KEY` environment variable (32-byte hex string)
- **Implementation:** `packages/db/src/crypto/token-encryption.ts` exports `encryptToken(plaintext: string): string` and `decryptToken(ciphertext: string): string`
- **Storage format:** Base64-encoded ciphertext with prepended IV (12 bytes)
- **Key rotation:** Not in Phase 5 scope. Document as future work.
- **Column type:** `TEXT` (stores base64-encoded ciphertext, not raw bytes)

Environment requirement: `TOKEN_ENCRYPTION_KEY` must be set in production. Tests use a hardcoded test key. Add to `.env.example`.

---

## 6. API Contracts

```
# ICS Feeds
GET    /api/v1/calendar/meetings.ics    — Public ICS feed for community meetings
GET    /api/v1/calendar/my-meetings.ics — User-filtered ICS feed (auth required)

# Google Calendar Sync
POST   /api/v1/calendar/google/connect  — Initiate OAuth flow
GET    /api/v1/calendar/google/callback — OAuth callback
POST   /api/v1/calendar/google/sync     — Trigger manual sync
DELETE /api/v1/calendar/google/disconnect — Remove connection

# Accounting Connectors
POST   /api/v1/accounting/connect       — Initiate OAuth for provider
GET    /api/v1/accounting/callback      — OAuth callback
POST   /api/v1/accounting/export        — Export ledger entries to accounting system
GET    /api/v1/accounting/mapping       — Get chart of accounts mapping
PUT    /api/v1/accounting/mapping       — Update mapping config
DELETE /api/v1/accounting/disconnect    — Remove connection
```

---

## 7. Authorization + RLS Policy Family Mapping

- ICS public feed: no auth required. Community is resolved via subdomain middleware (same as all other tenant-scoped routes). The feed URL is `https://[slug].propertyprofl.com/api/v1/calendar/meetings.ics`. Calendar apps bookmark this URL directly.
- ICS user feed: authenticated, returns only user's relevant meetings
- Google Calendar sync: board_president, cam, site_manager, property_manager_admin only
- Accounting connectors: cam, site_manager, property_manager_admin only

---

## 9. Failure Modes And Edge Cases

- Expired OAuth tokens → refresh flow with retry, notify user on permanent failure
- Google sync token invalidation → full re-sync from scratch
- ICS feed for community with no meetings → valid empty VCALENDAR
- Accounting export with unmapped categories → skip with warning, don't fail entire export
- Rate limiting from Google/QuickBooks APIs → exponential backoff with retry

---

## 10. Testing Plan

### Seed Strategy
- Use existing meeting fixtures for ICS feed tests
- Mock OAuth flows for unit tests; real sandbox for contract tests

### Teardown Rules
- Standard cleanup for sync tokens and connections
- Encrypted tokens: ensure cleanup removes all sensitive data

### Tenant Isolation Matrix
- communityA calendar feeds don't include communityB meetings
- Sync tokens are per-user-per-community

### Concurrency Cases
- Concurrent sync requests → idempotent sync with token-based state

### Environment Requirements
- `DATABASE_URL` — Required
- Google Calendar test project credentials — Required for contract tests (nightly)
- QuickBooks sandbox credentials — Required for contract tests (nightly)

### Required Test Coverage
- ICS feed generation correctness (integration)
- Calendar sync token lifecycle (integration)
- Accounting export data mapping (integration)
- Cross-tenant isolation (integration)
- Google Calendar sync/push (contract, nightly)
- QuickBooks export (contract, nightly)

---

## 12. Definition Of Done + Evidence Required

- [ ] ICS feed generation for meetings
- [ ] Google Calendar sync (OAuth + two-way sync)
- [ ] Accounting connector adapters (QuickBooks + Xero)
- [ ] No-mock integration tests
- [ ] Cross-tenant isolation tests
- [ ] RLS policies for new tables
- [ ] Audit logging for connection/disconnect
- [ ] Contract tests for Google + QuickBooks sandboxes (nightly)
- [ ] Evidence doc in `docs/audits/phase5-70-YYYY-MM-DD.md`

# Super Admin Support Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform admins the ability to view community data from the admin panel, impersonate users with read-only sessions for troubleshooting, and let community admins control whether support access is allowed — all with full audit logging.

**Architecture:** Three-layer system. Layer 1: Enhanced admin panel views of community data (zero risk, no impersonation). Layer 2: Read-only impersonation via signed JWTs with `act` claims (RFC 8693) and a persistent support banner. Layer 3: Community-level consent gating with a settings UI for community admins. Three new DB tables (`support_sessions`, `support_consent_grants`, `support_access_log`), a web middleware extension for impersonation detection, and admin app UI additions.

**Tech Stack:** Next.js 15 (App Router), Supabase Auth, Drizzle ORM, PostgreSQL RLS, jose (JWT signing/verification), Zod validation, Vitest for testing.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/db/src/schema/support-sessions.ts` | Drizzle schema for `support_sessions` table |
| `packages/db/src/schema/support-consent-grants.ts` | Drizzle schema for `support_consent_grants` table |
| `packages/db/src/schema/support-access-log.ts` | Drizzle schema for `support_access_log` table |
| `packages/db/migrations/0119_support_access.sql` | Migration: tables, RLS policies, indexes |
| `packages/shared/src/support-access.ts` | Shared types, constants, Zod schemas for support access |
| `apps/admin/src/lib/support/jwt.ts` | JWT signing/verification for impersonation tokens |
| `apps/admin/src/app/api/admin/support/sessions/route.ts` | POST (create) / GET (list) support sessions |
| `apps/admin/src/app/api/admin/support/sessions/[id]/route.ts` | PATCH (end session) |
| `apps/admin/src/app/api/admin/support/access-log/route.ts` | GET access log for a community |
| `apps/admin/src/components/clients/SupportAccessTab.tsx` | Support access tab UI in client workspace |
| `apps/admin/src/components/clients/StartSessionDialog.tsx` | Dialog to create impersonation session |
| `apps/admin/src/components/clients/AccessLogTable.tsx` | Access log viewer component |
| `apps/web/src/lib/support/impersonation.ts` | Middleware helper: detect/validate impersonation cookie |
| `apps/web/src/components/support/SupportBanner.tsx` | Persistent banner shown during impersonation |
| `apps/web/src/app/api/v1/settings/support-access/route.ts` | GET/POST consent management for community admins |
| `apps/web/src/components/settings/SupportAccessSettings.tsx` | Settings UI for consent toggle + access history |
| `apps/admin/__tests__/support/sessions.test.ts` | Unit tests for session API |
| `apps/admin/__tests__/support/jwt.test.ts` | Unit tests for JWT utility |
| `apps/web/__tests__/support/impersonation.test.ts` | Unit tests for impersonation middleware logic |
| `apps/web/__tests__/support/consent-api.test.ts` | Unit tests for consent API |

### Modified Files

| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Export 3 new tables + types |
| `packages/db/src/schema/rls-config.ts` | Add 2 tables to `RLS_TENANT_TABLES`, add 1 to `RLS_GLOBAL_TABLE_EXCLUSIONS`, bump `RLS_EXPECTED_TENANT_TABLE_COUNT` from 46 to 48 |
| `packages/db/src/schema/enums.ts` | Add `supportAccessLevelEnum` |
| `packages/db/migrations/meta/_journal.json` | Add entry idx 119 |
| `packages/db/src/utils/audit-logger.ts` | Add support access audit actions |
| `packages/shared/src/index.ts` | Re-export `support-access.ts` |
| `apps/web/src/middleware.ts` | Add impersonation cookie detection + read-only enforcement (~30 lines) |
| `apps/admin/src/app/clients/[id]/page.tsx` | Add "Support" tab to client workspace |
| `apps/admin/src/components/clients/ClientWorkspace.tsx` | Add SupportAccessTab to tab list |
| `apps/web/src/app/(authenticated)/settings/page.tsx` | Add support access section for admin users |
| `scripts/verify-scoped-db-access.ts` | Allowlist admin support routes for service-role access |
| `.env.example` | Add `SUPPORT_SESSION_JWT_SECRET` |

---

## Task 0: Install Dependencies

- [ ] **Step 1: Install `jose` for JWT operations**

```bash
pnpm --filter @propertypro/admin add jose
pnpm --filter @propertypro/web add jose
```

- [ ] **Step 2: Verify install**

Run: `pnpm list jose --filter @propertypro/admin && pnpm list jose --filter @propertypro/web`
Expected: `jose` listed in both packages

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add jose dependency for support session JWT"
```

---

## Task 1: Shared Types & Constants

**Files:**
- Create: `packages/shared/src/support-access.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the types and constants file**

```typescript
// packages/shared/src/support-access.ts
import { z } from 'zod';

// --- Access Levels ---
export const SUPPORT_ACCESS_LEVELS = ['read_only', 'read_write'] as const;
export type SupportAccessLevel = (typeof SUPPORT_ACCESS_LEVELS)[number];

// --- Session End Reasons ---
export const SESSION_END_REASONS = ['manual', 'expired', 'consent_revoked'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

// --- Session Constraints ---
export const SUPPORT_SESSION_MAX_TTL_HOURS = 1;
export const SUPPORT_SESSION_MAX_PER_ADMIN_PER_DAY = 10;

// --- Support Access Log Event Types ---
export const SUPPORT_ACCESS_EVENTS = [
  'session_started',
  'session_ended',
  'page_viewed',
  'consent_granted',
  'consent_revoked',
  'admin_data_viewed',
] as const;
export type SupportAccessEvent = (typeof SUPPORT_ACCESS_EVENTS)[number];

// --- Zod Schemas ---
export const CreateSessionSchema = z.object({
  targetUserId: z.string().uuid(),
  communityId: z.number().int().positive(),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
  ticketId: z.string().max(100).optional(),
});

export const ConsentToggleSchema = z.object({
  enabled: z.boolean(),
});

// --- JWT Claims ---
export interface SupportSessionJwtPayload {
  /** Target user ID (who we're impersonating) */
  sub: string;
  /** Actor claim per RFC 8693 */
  act: { sub: string };
  /** Community being accessed */
  community_id: number;
  /** Support session row ID */
  session_id: number;
  /** Access level */
  scope: SupportAccessLevel;
  /** Expiration (unix timestamp) */
  exp: number;
  /** Issued at */
  iat: number;
}

// --- Impersonation Cookie ---
export const SUPPORT_SESSION_COOKIE = 'pp-support-session';
```

- [ ] **Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './support-access';
```

- [ ] **Step 3: Verify the build**

Run: `pnpm --filter @propertypro/shared typecheck`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/support-access.ts packages/shared/src/index.ts
git commit -m "feat(shared): add support access types and constants"
```

---

## Task 2: Database Schema (Drizzle)

**Files:**
- Create: `packages/db/src/schema/support-sessions.ts`
- Create: `packages/db/src/schema/support-consent-grants.ts`
- Create: `packages/db/src/schema/support-access-log.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/enums.ts`

- [ ] **Step 1: Add the access level enum**

Add to `packages/db/src/schema/enums.ts` after `platformAdminRoleEnum`:
```typescript
export const supportAccessLevelEnum = pgEnum('support_access_level', ['read_only', 'read_write']);
```

- [ ] **Step 2: Create support_sessions schema**

```typescript
// packages/db/src/schema/support-sessions.ts
import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { supportAccessLevelEnum } from './enums';

export const supportSessions = pgTable('support_sessions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  targetUserId: uuid('target_user_id').notNull(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  ticketId: text('ticket_id'),
  accessLevel: supportAccessLevelEnum('access_level').notNull().default('read_only'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  endedReason: text('ended_reason').$type<'manual' | 'expired' | 'consent_revoked'>(),
  consentId: bigint('consent_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SupportSession = typeof supportSessions.$inferSelect;
export type NewSupportSession = typeof supportSessions.$inferInsert;
```

- [ ] **Step 3: Create support_consent_grants schema**

```typescript
// packages/db/src/schema/support-consent-grants.ts
import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const supportConsentGrants = pgTable('support_consent_grants', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').notNull(),
  accessLevel: text('access_level').$type<'read_only' | 'read_write'>().notNull().default('read_only'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type SupportConsentGrant = typeof supportConsentGrants.$inferSelect;
export type NewSupportConsentGrant = typeof supportConsentGrants.$inferInsert;
```

- [ ] **Step 4: Create support_access_log schema**

```typescript
// packages/db/src/schema/support-access-log.ts
import { bigint, bigserial, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const supportAccessLog = pgTable('support_access_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  adminUserId: uuid('admin_user_id').notNull(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  sessionId: bigint('session_id', { mode: 'number' }),
  event: text('event').$type<import('@propertypro/shared').SupportAccessEvent>().notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type SupportAccessLogEntry = typeof supportAccessLog.$inferSelect;
export type NewSupportAccessLogEntry = typeof supportAccessLog.$inferInsert;
```

- [ ] **Step 5: Export all from schema/index.ts**

Add these exports to `packages/db/src/schema/index.ts`:
```typescript
export { supportSessions, type SupportSession, type NewSupportSession } from './support-sessions';
export { supportConsentGrants, type SupportConsentGrant, type NewSupportConsentGrant } from './support-consent-grants';
export { supportAccessLog, type SupportAccessLogEntry, type NewSupportAccessLogEntry } from './support-access-log';
export { supportAccessLevelEnum } from './enums';
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm --filter @propertypro/db typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/support-sessions.ts packages/db/src/schema/support-consent-grants.ts packages/db/src/schema/support-access-log.ts packages/db/src/schema/index.ts packages/db/src/schema/enums.ts
git commit -m "feat(db): add support session, consent, and access log schemas"
```

---

## Task 3: Database Migration

**Files:**
- Create: `packages/db/migrations/0119_support_access.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/rls-config.ts`

- [ ] **Step 0: Verify highest existing migration number**

Run: `ls packages/db/migrations/01*.sql | sort | tail -3`
And: `tail -10 packages/db/migrations/meta/_journal.json`

The plan uses `0119` based on the current state (0118 is highest). If other migrations have been added since this plan was written, adjust the file number and journal index accordingly. The next available number = highest existing + 1.

- [ ] **Step 1: Write the migration SQL**

```sql
-- packages/db/migrations/0119_support_access.sql
-- Super Admin Support Access: sessions, consent, and audit log

-- Enum for access levels
DO $$ BEGIN
  CREATE TYPE support_access_level AS ENUM ('read_only', 'read_write');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Support Sessions (platform-scoped, not tenant-scoped)
CREATE TABLE support_sessions (
  id              bigserial PRIMARY KEY,
  admin_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  reason          text NOT NULL,
  ticket_id       text,
  access_level    support_access_level NOT NULL DEFAULT 'read_only',
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  ended_reason    text CHECK (ended_reason IN ('manual', 'expired', 'consent_revoked')),
  consent_id      bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_sessions_admin ON support_sessions(admin_user_id);
CREATE INDEX idx_support_sessions_community ON support_sessions(community_id);
CREATE INDEX idx_support_sessions_active ON support_sessions(admin_user_id)
  WHERE ended_at IS NULL;

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sessions FORCE ROW LEVEL SECURITY;

-- Only service role can read/write support sessions
CREATE POLICY support_sessions_service_bypass ON support_sessions
  FOR ALL USING (pp_rls_is_privileged());

-- 2. Support Consent Grants (one active per community)
CREATE TABLE support_consent_grants (
  id              bigserial PRIMARY KEY,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  granted_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  access_level    text NOT NULL DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'read_write')),
  granted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- Only one active (non-revoked) consent per community
CREATE UNIQUE INDEX idx_consent_active_community ON support_consent_grants(community_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_consent_community ON support_consent_grants(community_id);

ALTER TABLE support_consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_consent_grants FORCE ROW LEVEL SECURITY;

-- Service role can do everything; community admins can SELECT their own community's consent
CREATE POLICY consent_service_bypass ON support_consent_grants
  FOR ALL USING (pp_rls_is_privileged());

CREATE POLICY consent_community_read ON support_consent_grants
  FOR SELECT USING (pp_rls_can_access_community(community_id));

-- 3. Support Access Log (append-only audit trail)
CREATE TABLE support_access_log (
  id              bigserial PRIMARY KEY,
  admin_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  session_id      bigint REFERENCES support_sessions(id) ON DELETE SET NULL,
  event           text NOT NULL,
  resource_type   text,
  resource_id     text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_support_access_log_community ON support_access_log(community_id);
CREATE INDEX idx_support_access_log_admin ON support_access_log(admin_user_id);
CREATE INDEX idx_support_access_log_session ON support_access_log(session_id);

ALTER TABLE support_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_access_log FORCE ROW LEVEL SECURITY;

-- Service role for inserts; community admins can read their community's log
CREATE POLICY access_log_service_bypass ON support_access_log
  FOR ALL USING (pp_rls_is_privileged());

CREATE POLICY access_log_community_read ON support_access_log
  FOR SELECT USING (pp_rls_can_access_community(community_id));

-- Append-only guard: prevent UPDATE/DELETE on access log
CREATE OR REPLACE FUNCTION prevent_support_access_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'support_access_log is append-only'
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_access_log_append_only_guard
  BEFORE UPDATE OR DELETE ON support_access_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_support_access_log_mutation();

-- FK from sessions to consent
ALTER TABLE support_sessions
  ADD CONSTRAINT fk_support_sessions_consent
  FOREIGN KEY (consent_id) REFERENCES support_consent_grants(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Add journal entry**

Add to `packages/db/migrations/meta/_journal.json` entries array at index 119:
```json
{
  "idx": 119,
  "version": "7",
  "when": 1774650000000,
  "tag": "0119_support_access",
  "breakpoints": true
}
```

- [ ] **Step 3: Update RLS config**

In `packages/db/src/schema/rls-config.ts`:

1. Add to `RLS_GLOBAL_TABLE_EXCLUSIONS` array (before the `as const satisfies` line):
```typescript
{ tableName: 'support_sessions', reason: 'Platform-level support session tracking — service_role only. Admin-created sessions reference communities but are not tenant-scoped.' },
```

2. Add `support_consent_grants` and `support_access_log` to the `RLS_TENANT_TABLES` array (they have `community_id` but with custom policies):
```typescript
{ tableName: 'support_consent_grants', policyFamily: 'service_only' },
{ tableName: 'support_access_log', policyFamily: 'audit_log_restricted' },
```

3. Update `RLS_EXPECTED_TENANT_TABLE_COUNT` from `46` to `48`.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @propertypro/db typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0119_support_access.sql packages/db/migrations/meta/_journal.json packages/db/src/schema/rls-config.ts
git commit -m "feat(db): add support access migration with RLS policies"
```

---

## Task 4: Audit Logger Extension

**Files:**
- Modify: `packages/db/src/utils/audit-logger.ts`

- [ ] **Step 1: Read the current audit actions**

Run: `grep -n "AuditAction" packages/db/src/utils/audit-logger.ts | head -5`
Understand the union type structure.

- [ ] **Step 2: Add support access audit actions**

Add these to the `AuditAction` type union in `audit-logger.ts`:
```typescript
| 'support_session_started'
| 'support_session_ended'
| 'support_consent_granted'
| 'support_consent_revoked'
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @propertypro/db typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/utils/audit-logger.ts
git commit -m "feat(db): add support access audit action types"
```

---

## Task 5: JWT Utility for Impersonation Tokens

**Files:**
- Create: `apps/admin/src/lib/support/jwt.ts`
- Test: `apps/admin/__tests__/support/jwt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/admin/__tests__/support/jwt.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment
vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', 'test-secret-key-at-least-32-chars-long!!');

describe('Support Session JWT', () => {
  let signSupportToken: typeof import('../../src/lib/support/jwt').signSupportToken;
  let verifySupportToken: typeof import('../../src/lib/support/jwt').verifySupportToken;

  beforeEach(async () => {
    const mod = await import('../../src/lib/support/jwt');
    signSupportToken = mod.signSupportToken;
    verifySupportToken = mod.verifySupportToken;
  });

  it('signs and verifies a valid token', async () => {
    const payload = {
      sub: 'target-user-uuid',
      act: { sub: 'admin-user-uuid' },
      community_id: 123,
      session_id: 456,
      scope: 'read_only' as const,
    };

    const token = await signSupportToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifySupportToken(token);
    expect(verified.sub).toBe('target-user-uuid');
    expect(verified.act.sub).toBe('admin-user-uuid');
    expect(verified.community_id).toBe(123);
    expect(verified.session_id).toBe(456);
    expect(verified.scope).toBe('read_only');
  });

  it('rejects expired tokens', async () => {
    const payload = {
      sub: 'target-user-uuid',
      act: { sub: 'admin-user-uuid' },
      community_id: 123,
      session_id: 456,
      scope: 'read_only' as const,
      // Force expired by mocking time or using a negative TTL
    };

    // Sign with 0-second TTL
    const token = await signSupportToken(payload, 0);
    // Wait a tick
    await new Promise((r) => setTimeout(r, 50));
    await expect(verifySupportToken(token)).rejects.toThrow();
  });

  it('rejects tokens with invalid signature', async () => {
    const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid';
    await expect(verifySupportToken(token)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/support/jwt.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the JWT utility**

```typescript
// apps/admin/src/lib/support/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import type { SupportSessionJwtPayload } from '@propertypro/shared';
import { SUPPORT_SESSION_MAX_TTL_HOURS } from '@propertypro/shared';

function getSecret(): Uint8Array {
  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;
  if (!secret) throw new Error('SUPPORT_SESSION_JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

type SignPayload = Omit<SupportSessionJwtPayload, 'exp' | 'iat'>;

export async function signSupportToken(
  payload: SignPayload,
  ttlSeconds: number = SUPPORT_SESSION_MAX_TTL_HOURS * 3600,
): Promise<string> {
  const secret = getSecret();

  return new SignJWT({
    ...payload,
    act: payload.act,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(ttlSeconds === 0 ? '0s' : `${ttlSeconds}s`)
    .sign(secret);
}

export async function verifySupportToken(token: string): Promise<SupportSessionJwtPayload> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
  });
  return payload as unknown as SupportSessionJwtPayload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/support/jwt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/support/jwt.ts apps/admin/__tests__/support/jwt.test.ts
git commit -m "feat(admin): add JWT signing/verification for support sessions"
```

---

## Task 6: Admin API — Session Management

**Files:**
- Create: `apps/admin/src/app/api/admin/support/sessions/route.ts`
- Create: `apps/admin/src/app/api/admin/support/sessions/[id]/route.ts`
- Test: `apps/admin/__tests__/support/sessions.test.ts`

- [ ] **Step 1: Write the failing test for session creation**

```typescript
// apps/admin/__tests__/support/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockRequirePlatformAdmin = vi.fn();
const mockAdminDb = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
};

vi.mock('../../src/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: mockRequirePlatformAdmin,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => mockAdminDb,
}));

describe('POST /api/admin/support/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatformAdmin.mockResolvedValue({
      id: 'admin-uuid',
      email: 'admin@propertypro.com',
      role: 'super_admin',
    });
  });

  it('rejects requests without a reason', async () => {
    // Import the route handler
    const { POST } = await import(
      '../../src/app/api/admin/support/sessions/route'
    );

    const request = new Request('http://localhost/api/admin/support/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-uuid',
        communityId: 1,
        reason: 'short', // too short, min 10 chars
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('rejects when consent is not granted', async () => {
    mockAdminDb.maybeSingle.mockResolvedValueOnce({ data: null }); // no consent

    const { POST } = await import(
      '../../src/app/api/admin/support/sessions/route'
    );

    const request = new Request('http://localhost/api/admin/support/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-uuid',
        communityId: 1,
        reason: 'User reports document not loading on their dashboard',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('blocks impersonation of other platform admins', async () => {
    // Consent exists
    mockAdminDb.maybeSingle.mockResolvedValueOnce({
      data: { id: 1, access_level: 'read_only' },
    });
    // Target is a platform admin
    mockAdminDb.maybeSingle.mockResolvedValueOnce({
      data: { user_id: 'target-uuid', role: 'super_admin' },
    });

    const { POST } = await import(
      '../../src/app/api/admin/support/sessions/route'
    );

    const request = new Request('http://localhost/api/admin/support/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-uuid',
        communityId: 1,
        reason: 'Troubleshooting admin access issue',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('platform admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/support/sessions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the session creation route**

```typescript
// apps/admin/src/app/api/admin/support/sessions/route.ts
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { CreateSessionSchema, SUPPORT_SESSION_MAX_TTL_HOURS } from '@propertypro/shared';
import { signSupportToken } from '@/lib/support/jwt';

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  const body = await request.json();

  // Validate input
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { targetUserId, communityId, reason, ticketId } = parsed.data;
  const db = createAdminClient();

  // 1. Check consent
  const { data: consent } = await db
    .from('support_consent_grants')
    .select('id, access_level')
    .eq('community_id', communityId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!consent) {
    return NextResponse.json(
      { error: 'This community has not granted support access. Contact the community admin to enable it in Settings.' },
      { status: 403 },
    );
  }

  // 2. Block impersonation of platform admins
  const { data: targetAdmin } = await db
    .from('platform_admin_users')
    .select('user_id, role')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (targetAdmin) {
    return NextResponse.json(
      { error: 'Cannot impersonate another platform admin' },
      { status: 403 },
    );
  }

  // 3. Check daily session limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await db
    .from('support_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', admin.id)
    .gte('created_at', today.toISOString());

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Daily session limit reached (10 per day)' },
      { status: 429 },
    );
  }

  // 4. Create session
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_MAX_TTL_HOURS * 3600 * 1000);

  const { data: session, error: insertError } = await db
    .from('support_sessions')
    .insert({
      admin_user_id: admin.id,
      target_user_id: targetUserId,
      community_id: communityId,
      reason,
      ticket_id: ticketId ?? null,
      access_level: 'read_only',
      expires_at: expiresAt.toISOString(),
      consent_id: consent.id,
    })
    .select('id')
    .single();

  if (insertError || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  // 5. Sign JWT
  const token = await signSupportToken({
    sub: targetUserId,
    act: { sub: admin.id },
    community_id: communityId,
    session_id: session.id,
    scope: 'read_only',
  });

  // 6. Log to support access log
  await db.from('support_access_log').insert({
    admin_user_id: admin.id,
    community_id: communityId,
    session_id: session.id,
    event: 'session_started',
    metadata: { reason, ticket_id: ticketId, target_user_id: targetUserId },
  });

  return NextResponse.json({
    sessionId: session.id,
    token,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function GET(request: Request) {
  const admin = await requirePlatformAdmin();
  const db = createAdminClient();
  const { searchParams } = new URL(request.url);
  const communityId = searchParams.get('communityId');

  let query = db
    .from('support_sessions')
    .select('*, target_user:auth_users_view!target_user_id(email)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (communityId) {
    query = query.eq('community_id', Number(communityId));
  }

  const { data: sessions, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }

  return NextResponse.json({ sessions: sessions ?? [] });
}
```

- [ ] **Step 4: Write the session end route**

```typescript
// apps/admin/src/app/api/admin/support/sessions/[id]/route.ts
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requirePlatformAdmin();
  const { id } = await params;
  const db = createAdminClient();

  // End the session
  const { data: session, error } = await db
    .from('support_sessions')
    .update({
      ended_at: new Date().toISOString(),
      ended_reason: 'manual',
    })
    .eq('id', Number(id))
    .is('ended_at', null)
    .select('id, community_id')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found or already ended' }, { status: 404 });
  }

  // Log
  await db.from('support_access_log').insert({
    admin_user_id: admin.id,
    community_id: session.community_id,
    session_id: session.id,
    event: 'session_ended',
    metadata: { ended_reason: 'manual' },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/support/sessions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/api/admin/support/sessions/ apps/admin/__tests__/support/sessions.test.ts
git commit -m "feat(admin): add support session create/end API routes"
```

---

## Task 7: Admin API — Access Log

**Files:**
- Create: `apps/admin/src/app/api/admin/support/access-log/route.ts`

- [ ] **Step 1: Write the access log route**

```typescript
// apps/admin/src/app/api/admin/support/access-log/route.ts
import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export async function GET(request: Request) {
  await requirePlatformAdmin();
  const { searchParams } = new URL(request.url);
  const communityId = searchParams.get('communityId');

  if (!communityId) {
    return NextResponse.json({ error: 'communityId is required' }, { status: 400 });
  }

  const db = createAdminClient();

  const { data: entries, error } = await db
    .from('support_access_log')
    .select('*')
    .eq('community_id', Number(communityId))
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch access log' }, { status: 500 });
  }

  return NextResponse.json({ entries: entries ?? [] });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/api/admin/support/access-log/route.ts
git commit -m "feat(admin): add support access log API route"
```

---

## Task 8: Admin UI — Support Access Tab

**Files:**
- Create: `apps/admin/src/components/clients/SupportAccessTab.tsx`
- Create: `apps/admin/src/components/clients/StartSessionDialog.tsx`
- Create: `apps/admin/src/components/clients/AccessLogTable.tsx`
- Modify: `apps/admin/src/components/clients/ClientWorkspace.tsx`

- [ ] **Step 1: Read the existing ClientWorkspace to understand tab pattern**

Run: `grep -n "tabs\|Tab\|useState" apps/admin/src/components/clients/ClientWorkspace.tsx | head -20`
Understand the tab structure and how to add a new one.

- [ ] **Step 2: Create the AccessLogTable component**

```typescript
// apps/admin/src/components/clients/AccessLogTable.tsx
'use client';

import { useState, useEffect } from 'react';

interface AccessLogEntry {
  id: number;
  admin_user_id: string;
  event: string;
  resource_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function AccessLogTable({ communityId }: { communityId: number }) {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/support/access-log?communityId=${communityId}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [communityId]);

  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />;
  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No support access activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="py-2.5 px-3 font-medium">Event</th>
            <th className="py-2.5 px-3 font-medium">Admin</th>
            <th className="py-2.5 px-3 font-medium">Details</th>
            <th className="py-2.5 px-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-gray-100">
              <td className="py-2.5 px-3">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                  {entry.event.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="py-2.5 px-3 text-gray-600 font-mono text-xs">
                {entry.admin_user_id.slice(0, 8)}…
              </td>
              <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[200px] truncate">
                {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
              </td>
              <td className="py-2.5 px-3 text-gray-500 text-xs">
                {new Date(entry.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create the StartSessionDialog component**

```typescript
// apps/admin/src/components/clients/StartSessionDialog.tsx
'use client';

import { useState } from 'react';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

interface Member {
  user_id: string;
  email: string;
  role: string;
}

interface Props {
  communityId: number;
  communitySlug: string;
  members: Member[];
  open: boolean;
  onClose: () => void;
}

export function StartSessionDialog({ communityId, communitySlug, members, open, onClose }: Props) {
  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleStart() {
    if (!targetUserId || reason.length < 10) {
      setError('Select a user and provide a reason (min 10 characters).');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/support/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, communityId, reason, ticketId: ticketId || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create session');
        return;
      }

      const { token } = await res.json();

      // Set impersonation cookie for the tenant subdomain
      // Domain must be .propertyprofl.com so it's readable on [slug].propertyprofl.com
      const cookieDomain = window.location.hostname.includes('localhost')
        ? '' // No domain attribute in dev
        : '; domain=.propertyprofl.com';
      document.cookie = `${SUPPORT_SESSION_COOKIE}=${token}; path=/; max-age=3600; SameSite=Lax; Secure${cookieDomain}`;

      // Open the community's dashboard in a new tab
      const tenantUrl = `https://${communitySlug}.propertyprofl.com/dashboard`;
      window.open(tenantUrl, '_blank');
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Start Support Session</h3>

        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
          This will open a read-only view of the community as the selected user. All actions are logged.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View as user *</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.email} ({m.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="Describe the issue you're investigating…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticket ID (optional)</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. SUP-1234"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              onClick={handleStart}
              disabled={loading}
            >
              {loading ? 'Starting…' : 'Start Read-Only Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the SupportAccessTab component**

```typescript
// apps/admin/src/components/clients/SupportAccessTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { AccessLogTable } from './AccessLogTable';
import { StartSessionDialog } from './StartSessionDialog';

interface Props {
  communityId: number;
  communitySlug: string;
}

interface ConsentStatus {
  active: boolean;
  grantedBy?: string;
  grantedAt?: string;
}

interface Session {
  id: number;
  admin_user_id: string;
  target_user_id: string;
  reason: string;
  ticket_id: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  ended_reason: string | null;
}

interface Member {
  user_id: string;
  email: string;
  role: string;
}

export function SupportAccessTab({ communityId, communitySlug }: Props) {
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/support/sessions?communityId=${communityId}`).then((r) => r.json()),
      fetch(`/api/admin/communities/${communityId}/members`).then((r) => r.json()),
    ])
      .then(([sessionData, memberData]) => {
        setSessions(sessionData.sessions ?? []);
        setMembers(memberData.members ?? memberData ?? []);

        // Derive consent from sessions or check directly
        // For now, we'll just show sessions
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [communityId]);

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-100 rounded" /><div className="h-32 bg-gray-100 rounded" /></div>;
  }

  const activeSessions = sessions.filter((s) => !s.ended_at && new Date(s.expires_at) > new Date());

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">Active Support Sessions</h4>
          {activeSessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm text-amber-700">
              <span>Session #{s.id} — expires {new Date(s.expires_at).toLocaleTimeString()}</span>
              <button
                className="text-xs text-red-600 hover:text-red-800 font-medium"
                onClick={async () => {
                  await fetch(`/api/admin/support/sessions/${s.id}`, { method: 'PATCH' });
                  setSessions((prev) => prev.map((p) => p.id === s.id ? { ...p, ended_at: new Date().toISOString(), ended_reason: 'manual' } : p));
                }}
              >
                End Session
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Start Session */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Impersonation</h4>
          <p className="text-xs text-gray-500 mt-0.5">View the platform as a specific community member (read-only)</p>
        </div>
        <button
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          onClick={() => setDialogOpen(true)}
        >
          Start Session
        </button>
      </div>

      {/* Recent Sessions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Recent Sessions</h4>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500">No support sessions recorded for this community.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 px-3 font-medium">ID</th>
                  <th className="py-2 px-3 font-medium">Reason</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-mono text-xs">#{s.id}</td>
                    <td className="py-2 px-3 text-gray-600 max-w-[250px] truncate">{s.reason}</td>
                    <td className="py-2 px-3">
                      {s.ended_at ? (
                        <span className="text-xs text-gray-500">Ended ({s.ended_reason})</span>
                      ) : new Date(s.expires_at) < new Date() ? (
                        <span className="text-xs text-gray-500">Expired</span>
                      ) : (
                        <span className="text-xs text-green-600 font-medium">Active</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">
                      {new Date(s.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Access Log */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Access Log</h4>
        <AccessLogTable communityId={communityId} />
      </div>

      <StartSessionDialog
        communityId={communityId}
        communitySlug={communitySlug}
        members={members}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add the tab to ClientWorkspace**

Read `apps/admin/src/components/clients/ClientWorkspace.tsx` to find the tabs array, then add:
```typescript
{ id: 'support', label: 'Support', icon: HeadphonesIcon }
```

And in the tab content rendering section:
```typescript
{activeTab === 'support' && (
  <SupportAccessTab communityId={community.id} communitySlug={community.slug} />
)}
```

- [ ] **Step 6: Verify build**

Run: `pnpm --filter @propertypro/admin typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/clients/SupportAccessTab.tsx apps/admin/src/components/clients/StartSessionDialog.tsx apps/admin/src/components/clients/AccessLogTable.tsx apps/admin/src/components/clients/ClientWorkspace.tsx
git commit -m "feat(admin): add support access tab with session management UI"
```

---

## Task 9: Web Middleware — Impersonation Detection

**Files:**
- Create: `apps/web/src/lib/support/impersonation.ts`
- Modify: `apps/web/src/middleware.ts`
- Test: `apps/web/__tests__/support/impersonation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/__tests__/support/impersonation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubEnv('SUPPORT_SESSION_JWT_SECRET', 'test-secret-key-at-least-32-chars-long!!');

describe('Impersonation detection', () => {
  let parseImpersonationCookie: typeof import('../../src/lib/support/impersonation').parseImpersonationCookie;

  beforeEach(async () => {
    const mod = await import('../../src/lib/support/impersonation');
    parseImpersonationCookie = mod.parseImpersonationCookie;
  });

  it('returns null when no cookie present', async () => {
    const result = await parseImpersonationCookie(undefined);
    expect(result).toBeNull();
  });

  it('returns null for invalid token', async () => {
    const result = await parseImpersonationCookie('garbage.token.value');
    expect(result).toBeNull();
  });

  it('blocks mutations in read-only mode', async () => {
    const { isReadOnlyBlocked } = await import('../../src/lib/support/impersonation');
    expect(isReadOnlyBlocked('POST')).toBe(true);
    expect(isReadOnlyBlocked('PUT')).toBe(true);
    expect(isReadOnlyBlocked('PATCH')).toBe(true);
    expect(isReadOnlyBlocked('DELETE')).toBe(true);
    expect(isReadOnlyBlocked('GET')).toBe(false);
    expect(isReadOnlyBlocked('HEAD')).toBe(false);
    expect(isReadOnlyBlocked('OPTIONS')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/support/impersonation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the impersonation helper**

```typescript
// apps/web/src/lib/support/impersonation.ts
import { jwtVerify } from 'jose';
import type { SupportSessionJwtPayload } from '@propertypro/shared';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isReadOnlyBlocked(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export async function parseImpersonationCookie(
  cookieValue: string | undefined,
): Promise<SupportSessionJwtPayload | null> {
  if (!cookieValue) return null;

  const secret = process.env.SUPPORT_SESSION_JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      cookieValue,
      new TextEncoder().encode(secret),
      { algorithms: ['HS256'] },
    );

    // Validate required claims
    if (
      !payload.sub ||
      !payload.act ||
      typeof (payload.act as Record<string, unknown>).sub !== 'string' ||
      typeof payload.community_id !== 'number' ||
      typeof payload.session_id !== 'number'
    ) {
      return null;
    }

    return payload as unknown as SupportSessionJwtPayload;
  } catch {
    // Expired, invalid signature, malformed — all return null
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/support/impersonation.test.ts`
Expected: PASS

- [ ] **Step 5: Modify the web middleware**

In `apps/web/src/middleware.ts`, add the impersonation check. Find the section after auth validation (after the user session is confirmed) and before the response is returned. Add:

```typescript
// --- Support Impersonation Check ---
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';
import { parseImpersonationCookie, isReadOnlyBlocked } from './lib/support/impersonation';

// Inside the middleware function, after auth checks succeed:
const supportCookie = request.cookies.get(SUPPORT_SESSION_COOKIE)?.value;
if (supportCookie) {
  const impersonation = await parseImpersonationCookie(supportCookie);

  if (impersonation) {
    // Block mutations for read-only sessions
    if (impersonation.scope === 'read_only' && isReadOnlyBlocked(request.method)) {
      // Allow the session-end endpoint through
      if (!request.nextUrl.pathname.includes('/api/v1/support/session')) {
        return NextResponse.json(
          { error: 'Support sessions are read-only' },
          { status: 403 },
        );
      }
    }

    // Set headers for downstream use (route handlers can read these)
    response.headers.set('x-support-session', 'true');
    response.headers.set('x-support-admin-id', impersonation.act.sub);
    response.headers.set('x-support-session-id', String(impersonation.session_id));
  } else {
    // Invalid/expired cookie — clear it
    response.cookies.delete(SUPPORT_SESSION_COOKIE);
  }
}
```

**Important:** This goes *after* the existing auth check (around line 482) but *before* the response is finalized (around line 623). The exact insertion point should be determined by reading the middleware.

**Note for the implementing agent:** The middleware is ~650 lines. Read it carefully before editing. The impersonation check should be a small, self-contained block (~25 lines) that doesn't interfere with existing logic. It does NOT replace the Supabase session — the user's real session still handles auth. The impersonation cookie is *additive* context.

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/support/impersonation.ts apps/web/src/middleware.ts apps/web/__tests__/support/impersonation.test.ts
git commit -m "feat(web): add impersonation detection to middleware with read-only enforcement"
```

---

## Task 10: Web API — Consent Management

**Files:**
- Create: `apps/web/src/app/api/v1/settings/support-access/route.ts`
- Test: `apps/web/__tests__/support/consent-api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/__tests__/support/consent-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAuth = vi.fn();
const mockRequireMembership = vi.fn();
const mockRequirePermission = vi.fn();
const mockLogAuditEvent = vi.fn();

// Mock the Supabase admin client (chained query builder)
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null });
const mockSingle = vi.fn().mockResolvedValue({ data: null });
const mockOrder = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) });
const mockIs = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle, order: mockOrder });
const mockEq = vi.fn().mockReturnValue({ is: mockIs, eq: vi.fn().mockReturnValue({ is: mockIs }) });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
const mockAdminDb = {
  from: vi.fn().mockReturnValue({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
};

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: mockRequireAuth,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: mockRequireMembership,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: mockRequirePermission,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => mockAdminDb,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: mockLogAuditEvent,
}));

describe('GET /api/v1/settings/support-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue('user-uuid');
    mockRequireMembership.mockResolvedValue({
      userId: 'user-uuid',
      communityId: 1,
      role: 'manager',
      isAdmin: true,
    });
  });

  it('returns consent status for admin users', async () => {
    const { GET } = await import(
      '../../src/app/api/v1/settings/support-access/route'
    );

    const request = new Request('http://localhost/api/v1/settings/support-access', {
      headers: { 'x-community-id': '1' },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('consentActive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/support/consent-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the consent API route**

```typescript
// apps/web/src/app/api/v1/settings/support-access/route.ts
import { NextResponse } from 'next/server';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConsentToggleSchema } from '@propertypro/shared';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { logAuditEvent } from '@propertypro/db';

export const GET = withErrorHandler(async (request: Request) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = Number(request.headers.get('x-community-id')!);
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'read');

  const db = createAdminClient();

  // Get active consent
  const { data: consent } = await db
    .from('support_consent_grants')
    .select('id, granted_by, access_level, granted_at, expires_at')
    .eq('community_id', communityId)
    .is('revoked_at', null)
    .maybeSingle();

  // Get recent access log entries (visible to community admins)
  const { data: accessLog } = await db
    .from('support_access_log')
    .select('id, admin_user_id, event, created_at, metadata')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    consentActive: !!consent,
    consent: consent ?? null,
    recentAccess: accessLog ?? [],
  });
});

export const POST = withErrorHandler(async (request: Request) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = Number(request.headers.get('x-community-id'));
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'settings', 'write');

  const body = await request.json();
  const parsed = ConsentToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const db = createAdminClient();

  if (parsed.data.enabled) {
    // Check if already active
    const { data: existing } = await db
      .from('support_consent_grants')
      .select('id')
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, message: 'Already enabled' });
    }

    // Grant consent
    await db.from('support_consent_grants').insert({
      community_id: communityId,
      granted_by: userId,
      access_level: 'read_only',
    });

    await db.from('support_access_log').insert({
      admin_user_id: userId,
      community_id: communityId,
      event: 'consent_granted',
      metadata: { granted_by_role: membership.role },
    });

    await logAuditEvent({
      userId,
      action: 'support_consent_granted',
      resourceType: 'support_consent',
      resourceId: String(communityId),
      communityId,
    });
  } else {
    // Revoke consent
    const { data: active } = await db
      .from('support_consent_grants')
      .select('id')
      .eq('community_id', communityId)
      .is('revoked_at', null)
      .maybeSingle();

    if (!active) {
      return NextResponse.json({ ok: true, message: 'Already disabled' });
    }

    await db
      .from('support_consent_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq('id', active.id);

    // Terminate any active sessions for this community
    await db
      .from('support_sessions')
      .update({ ended_at: new Date().toISOString(), ended_reason: 'consent_revoked' })
      .eq('community_id', communityId)
      .is('ended_at', null);

    await db.from('support_access_log').insert({
      admin_user_id: userId,
      community_id: communityId,
      event: 'consent_revoked',
      metadata: { revoked_by_role: membership.role },
    });

    await logAuditEvent({
      userId,
      action: 'support_consent_revoked',
      resourceType: 'support_consent',
      resourceId: String(communityId),
      communityId,
    });
  }

  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/support/consent-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/settings/support-access/route.ts apps/web/__tests__/support/consent-api.test.ts
git commit -m "feat(web): add consent management API for support access"
```

---

## Task 11: Web UI — Support Banner + Consent Settings

**Files:**
- Create: `apps/web/src/components/support/SupportBanner.tsx`
- Create: `apps/web/src/components/settings/SupportAccessSettings.tsx`
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Create the SupportBanner component**

```typescript
// apps/web/src/components/support/SupportBanner.tsx
'use client';

import { useEffect, useState } from 'react';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';

/**
 * Persistent banner shown at the top of the page during a support impersonation session.
 * Reads the impersonation cookie to determine if a support session is active.
 * This component should be included in the root layout.
 */
export function SupportBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // Check for support session cookie
    const hasCookie = document.cookie
      .split('; ')
      .some((c) => c.startsWith(`${SUPPORT_SESSION_COOKIE}=`));
    setActive(hasCookie);
  }, []);

  if (!active) return null;

  function endSession() {
    // Clear the cookie
    document.cookie = `${SUPPORT_SESSION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure`;
    setActive(false);
    // Redirect to a neutral page
    window.location.href = '/dashboard';
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-4">
      <span className="inline-flex items-center gap-1.5">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Support Mode — Read-Only
      </span>
      <button
        onClick={endSession}
        className="underline hover:no-underline text-white/90 hover:text-white"
      >
        End Session
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create the SupportAccessSettings component**

```typescript
// apps/web/src/components/settings/SupportAccessSettings.tsx
'use client';

import { useState, useEffect } from 'react';

interface ConsentState {
  consentActive: boolean;
  consent: { granted_at: string; access_level: string } | null;
  recentAccess: Array<{
    id: number;
    event: string;
    admin_user_id: string;
    created_at: string;
  }>;
}

export function SupportAccessSettings() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch('/api/v1/settings/support-access')
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  async function toggleConsent() {
    if (!state) return;
    setToggling(true);
    try {
      await fetch('/api/v1/settings/support-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !state.consentActive }),
      });
      // Refresh
      const res = await fetch('/api/v1/settings/support-access');
      setState(await res.json());
    } catch {
      // silently fail
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <div className="animate-pulse h-20 bg-gray-100 rounded-lg" />;
  if (!state) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Platform Support Access</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Allow PropertyPro support to view your community data for troubleshooting.
          </p>
        </div>
        <button
          onClick={toggleConsent}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            state.consentActive ? 'bg-[var(--interactive-primary)]' : 'bg-gray-300'
          }`}
          role="switch"
          aria-checked={state.consentActive}
          aria-label="Toggle support access"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              state.consentActive ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {state.consentActive && state.consent && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Enabled since {new Date(state.consent.granted_at).toLocaleDateString()} — {state.consent.access_level.replace('_', ' ')} access
        </p>
      )}

      {state.recentAccess.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-2">Recent Support Activity</h4>
          <ul className="space-y-1">
            {state.recentAccess.slice(0, 5).map((entry) => (
              <li key={entry.id} className="text-xs text-[var(--text-tertiary)] flex justify-between">
                <span>{entry.event.replace(/_/g, ' ')}</span>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add to settings page**

In `apps/web/src/app/(authenticated)/settings/page.tsx`, find the admin-only section and add:

```typescript
import { SupportAccessSettings } from '@/components/settings/SupportAccessSettings';

// Inside the admin-only rendering block:
<div className="border-t border-[var(--border-default)] pt-6">
  <SupportAccessSettings />
</div>
```

- [ ] **Step 4: Add SupportBanner to root layout**

In the authenticated layout (the layout that wraps all authenticated pages), add `<SupportBanner />` at the top of the `<body>` or main container:

```typescript
import { SupportBanner } from '@/components/support/SupportBanner';

// At the top of the page content, before main navigation:
<SupportBanner />
```

- [ ] **Step 5: Verify build**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/support/SupportBanner.tsx apps/web/src/components/settings/SupportAccessSettings.tsx apps/web/src/app/\(authenticated\)/settings/page.tsx
git commit -m "feat(web): add support access consent settings and impersonation banner"
```

---

## Task 12: CI Guard & Environment Config

**Files:**
- Modify: `scripts/verify-scoped-db-access.ts`
- Modify: `.env.example`

- [ ] **Step 1: Read the CI guard to understand the allowlist pattern**

Run: `grep -n "allowlist\|ALLOW\|exempt" scripts/verify-scoped-db-access.ts | head -10`

- [ ] **Step 2: Add admin support routes to the allowlist**

Add to the `WEB_UNSAFE_IMPORT_ALLOWLIST` in `scripts/verify-scoped-db-access.ts`:
```typescript
// Support access consent — uses createAdminClient for cross-community consent/log queries
resolve(repoRoot, 'apps/web/src/app/api/v1/settings/support-access/route.ts'),
```

The admin app routes (`apps/admin/`) are already outside the CI guard's scope (it only scans `apps/web/`), so they don't need explicit allowlisting.

- [ ] **Step 3: Add env var to .env.example**

Add to `.env.example`:
```bash
# Support Session JWT Secret (min 32 chars, generate with: openssl rand -base64 32)
SUPPORT_SESSION_JWT_SECRET=
```

- [ ] **Step 4: Verify CI guard passes**

Run: `pnpm guard:db-access`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-scoped-db-access.ts .env.example
git commit -m "chore: allowlist support routes in CI guard, add JWT secret to env example"
```

---

## Task 13: Full Build & Lint Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: PASS (includes DB access guard)

- [ ] **Step 3: Run unit tests**

Run: `pnpm test`
Expected: All tests pass including new support access tests

- [ ] **Step 4: Fix any failures**

If any step fails, fix the issue before proceeding.

- [ ] **Step 5: Final commit (if fixes were needed)**

```bash
git commit -m "fix: address lint/type/test issues from support access implementation"
```

---

## Post-Implementation Notes

### Default Consent State
New communities should have consent **opted-in by default**. Add a step to the community onboarding flow (in `apps/web/src/lib/services/onboarding-service.ts`) that creates a `support_consent_grants` row. This can be done as a follow-up task.

### Cookie Domain Considerations
The impersonation cookie is set on the admin app's domain. For it to work on tenant subdomains (`[slug].propertyprofl.com`), the cookie domain needs to be `.propertyprofl.com`. This requires the admin app to be on the same root domain or the token to be passed via URL parameter (one-time use, cleared immediately). The implementing agent should check what domain the admin app runs on and adjust the cookie setting in `StartSessionDialog.tsx` accordingly.

### jose Dependency
The `jose` library is needed for JWT operations. Check if it's already in the dependency tree:
```bash
pnpm list jose --filter @propertypro/admin
```
If not, add it:
```bash
pnpm --filter @propertypro/admin add jose
pnpm --filter @propertypro/web add jose
```

### Migration Application
After merging, the migration must be applied:
```bash
pnpm --filter @propertypro/db db:migrate
```

### Environment Variable
Before testing, set in `.env.local`:
```bash
SUPPORT_SESSION_JWT_SECRET=$(openssl rand -base64 32)
```

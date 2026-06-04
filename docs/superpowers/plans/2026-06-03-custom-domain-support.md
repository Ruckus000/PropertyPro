# Custom Domain Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Pro+ PM attach one custom host (e.g. `www.sunsetcondos.com`) to their community's public `/` site, registered live with the Vercel Domains API and verified via a manual button, with middleware routing the verified host to the existing public-site renderer.

**Architecture:** Six independently-shippable PRs. A shared host validator + an inert schema/flag foundation + a node-runtime Vercel client land first (all dark). Then base-domain-aware middleware routing (reads the schema, serves nothing until data exists), the gated A1 routes that write status, and finally the PM settings UI. The `custom_domain` column already exists; this adds `custom_domain_status` + `custom_domain_verified_at` + a partial unique index, and flips `hasSiteCustomDomain` on for Pro plans.

**Tech Stack:** Next 15 (App Router, edge middleware) · TypeScript · React 19 · Drizzle/Supabase · Vitest · Plan A1 `defineRoute`/`runRoute` (`@propertypro/api-contract`) · Vercel Domains REST API.

**Spec:** [docs/superpowers/specs/2026-06-03-custom-domain-support-design.md](../specs/2026-06-03-custom-domain-support-design.md)

**Reference (read before starting):** `.claude/rules/api-patterns.md`, `.claude/rules/tenant-isolation.md`, `.claude/rules/migration-safety.md`, `.claude/rules/design.md`, and the memory file `turbo_typecheck_cache_trap.md` (the three local-green/CI-red traps).

---

## Cross-cutting conventions (apply to every task)

- **Branch per PR** off fresh main: `git fetch origin main --quiet && git checkout -b claude/<slug> origin/main`. After a squash-merge: `git checkout --detach` before the next branch.
- **TDD:** write failing test → run → see it fail → minimal impl → run → green → commit.
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Local-only failures to ignore** (write tests, push, trust CI): route tests importing `@propertypro/api-contract` ("Failed to resolve entry"); DB-gated tests ("Missing DATABASE_URL").
- **New `@propertypro/shared` / `@propertypro/db` exports** need `pnpm --filter @propertypro/<pkg> build` before web typecheck/tests resolve them locally.
- **Final-verify gauntlet per PR** (from repo root):
  - `pnpm exec vitest run <changed test paths>`
  - `pnpm exec tsx scripts/verify-scoped-db-access.ts && pnpm exec tsx scripts/verify-contracts.ts`
  - cache-free typecheck: `pnpm --filter @propertypro/<pkg> exec tsc --noEmit`
  - `pnpm lint` when touching guards/migrations
  - real build when a client component or middleware changes: `pnpm --filter @propertypro/web build` (placeholder `DATABASE_URL`/`DIRECT_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`)

---

## File structure (whole feature)

| File | PR | Responsibility |
|---|---|---|
| `packages/shared/src/site/custom-domain.ts` | 1 | `sanitizeCustomDomain`, `isValidHostname`, `isOwnDomain`, `assertCustomDomainAllowed` — the single shared validator + own-domain blocklist |
| `packages/shared/src/index.ts` | 1 | re-export the new module |
| `apps/admin/src/lib/clients/website.ts` | 1 | import `sanitizeCustomDomain` from shared (drop the local copy) |
| `packages/db/migrations/0012_custom_domain_status.sql` | 2 | `custom_domain_status`, `custom_domain_verified_at`, partial unique index |
| `packages/db/migrations/meta/_journal.json` | 2 | journal entry idx for 0012 |
| `packages/db/src/schema/communities.ts` | 2 | add the two columns to the Drizzle schema |
| `packages/shared/src/features/plan-features.ts` | 2 | `hasSiteCustomDomain: true` on professional + operations_plus |
| `packages/shared/src/features/community-features.ts` | 2 | `hasSiteCustomDomain: true` on all three types |
| `apps/web/src/lib/domains/vercel-domains-client.ts` | 3 | typed Vercel Domains REST wrapper (node runtime) |
| `packages/shared/src/middleware/subdomain-router.ts` | 4 | `rootDomain`-aware `resolveCommunityContext` (stays pure) |
| `apps/web/src/middleware.ts` | 4 | foreign-host lookup + rewrite; custom-domain cache; skip authed→dashboard on custom host |
| `apps/web/src/lib/services/custom-domain-service.ts` | 5 | orchestrates validate → Vercel → write `communities` (unscoped) → audit |
| `apps/web/src/app/api/v1/pm/site/domain/contract.ts` | 5 | A1 contracts (GET/POST/verify/DELETE) |
| `apps/web/src/app/api/v1/pm/site/domain/route.ts` | 5 | GET + POST + DELETE handlers |
| `apps/web/src/app/api/v1/pm/site/domain/verify/route.ts` | 5 | verify handler |
| `apps/web/src/app/api/v1/pm/site/domain/verify/contract.ts` | 5 | verify contract |
| `packages/db/src/utils/audit-logger.ts` | 5 | add `custom_domain_*` to `AuditAction` union |
| `apps/web/src/components/pm/site-editor/CustomDomainCard.tsx` | 6 | `'use client'` domain card |
| `apps/web/src/hooks/use-custom-domain.ts` | 6 | react-query hooks |
| `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` | 6 | render the card (gated) |
| `.env.example` | 2 | document `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_ORG_ID` + `NEXT_PUBLIC_ROOT_DOMAIN` |

---

# PR1 — Shared host validator + own-domain blocklist

**Branch:** `claude/custom-domain-1-validator`
**Net effect:** pure refactor + new guard. Admin behavior unchanged; web gains an importable validator. Dark.

### Task 1.1: Create the shared validator module

**Files:**
- Create: `packages/shared/src/site/custom-domain.ts`
- Test: `packages/shared/src/site/custom-domain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/site/custom-domain.test.ts
import { describe, it, expect } from 'vitest';
import {
  sanitizeCustomDomain,
  isOwnDomain,
  assertCustomDomainAllowed,
} from './custom-domain';

describe('sanitizeCustomDomain', () => {
  it('accepts and lowercases a valid host', () => {
    expect(sanitizeCustomDomain('WWW.SunsetCondos.com')).toBe('www.sunsetcondos.com');
  });
  it('strips protocol, path, query, fragment and port', () => {
    expect(sanitizeCustomDomain('https://www.foo.com:443/path?x#y')).toBe('www.foo.com');
  });
  it('rejects single-label and malformed hosts', () => {
    expect(sanitizeCustomDomain('localhost')).toBeNull();
    expect(sanitizeCustomDomain('-bad.com')).toBeNull();
    expect(sanitizeCustomDomain('')).toBeNull();
    expect(sanitizeCustomDomain(null)).toBeNull();
  });
});

describe('isOwnDomain', () => {
  it('flags the root domain and its subdomains', () => {
    expect(isOwnDomain('getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isOwnDomain('cam.getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isOwnDomain('www.sunsetcondos.com', 'getpropertypro.com')).toBe(false);
  });
  it('strips a port on the root domain before comparing', () => {
    expect(isOwnDomain('sunset.localhost', 'localhost:3000')).toBe(true);
  });
});

describe('assertCustomDomainAllowed', () => {
  it('returns the sanitized host when valid and not own-domain', () => {
    expect(assertCustomDomainAllowed('www.foo.com', 'getpropertypro.com')).toBe('www.foo.com');
  });
  it('throws on an invalid host', () => {
    expect(() => assertCustomDomainAllowed('nope', 'getpropertypro.com')).toThrow(/invalid/i);
  });
  it('throws on an own-domain host', () => {
    expect(() => assertCustomDomainAllowed('x.getpropertypro.com', 'getpropertypro.com')).toThrow(/reserved/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/shared exec vitest run src/site/custom-domain.test.ts`
Expected: FAIL — module `./custom-domain` not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared/src/site/custom-domain.ts
/**
 * Single source of truth for custom-domain host validation, shared by the
 * admin display helpers and the PM-facing web routes. Pure functions — no env,
 * no IO — so they are trivially testable on both edge and node runtimes.
 */

const HOSTNAME_LABEL = /^[a-z0-9-]+$/i;

export function isValidHostname(hostname: string): boolean {
  if (hostname.length < 3 || hostname.length > 253) return false;
  if (!hostname.includes('.')) return false;
  return hostname.split('.').every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      HOSTNAME_LABEL.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}

/** Normalize raw input to a bare lowercase hostname, or null if unusable. */
export function sanitizeCustomDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split(/[/?#]/, 1)[0]?.split(':', 1)[0]?.trim() ?? '';
  if (!hostname || !isValidHostname(hostname)) return null;
  return hostname;
}

/** Bare-host form of a root domain that may carry a dev port (localhost:3000). */
function rootHost(rootDomain: string): string {
  return rootDomain.split(':')[0]?.trim().toLowerCase() ?? rootDomain.toLowerCase();
}

/** True when `host` is the platform root domain or one of its subdomains. */
export function isOwnDomain(host: string, rootDomain: string): boolean {
  const h = host.split(':')[0]?.trim().toLowerCase() ?? '';
  const root = rootHost(rootDomain);
  return h === root || h.endsWith(`.${root}`);
}

export class CustomDomainNotAllowedError extends Error {}

/**
 * Validate a candidate custom domain. Returns the sanitized host, or throws
 * `CustomDomainNotAllowedError` with a message safe to surface to the PM.
 */
export function assertCustomDomainAllowed(raw: string | null | undefined, rootDomain: string): string {
  const host = sanitizeCustomDomain(raw);
  if (!host) {
    throw new CustomDomainNotAllowedError('That doesn’t look like a valid domain. Use a host like www.yourcommunity.com.');
  }
  if (isOwnDomain(host, rootDomain)) {
    throw new CustomDomainNotAllowedError('That domain is reserved by PropertyPro and can’t be used as a custom domain.');
  }
  return host;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/shared exec vitest run src/site/custom-domain.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Re-export from the package barrel**

Add to `packages/shared/src/index.ts` (near the other `export * from './site/...'` / feature exports — match the existing grouping):

```ts
export * from './site/custom-domain';
```

- [ ] **Step 6: Build shared so downstream packages resolve it**

Run: `pnpm --filter @propertypro/shared build`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/site/custom-domain.ts packages/shared/src/site/custom-domain.test.ts packages/shared/src/index.ts
git commit -m "$(printf 'Add shared custom-domain validator + own-domain blocklist\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 1.2: Repoint the admin app at the shared validator

**Files:**
- Modify: `apps/admin/src/lib/clients/website.ts`

- [ ] **Step 1: Run the existing admin test first (baseline green)**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/clients/website-status.test.ts`
Expected: PASS (pre-change baseline).

- [ ] **Step 2: Replace the local validator with the shared import**

In `apps/admin/src/lib/clients/website.ts`, delete the local `isValidHostname` and `sanitizeCustomDomain` function definitions and import the shared one at the top:

```ts
import { sanitizeCustomDomain } from '@propertypro/shared';
```

Leave `getWebsiteDomainInfo`, `getSiteLiveStatus`, `formatSiteNotLiveMessage` and the types unchanged — they keep calling `sanitizeCustomDomain(input.customDomain)` exactly as before.

- [ ] **Step 3: Run admin test + cache-free typecheck**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/clients/website-status.test.ts`
Expected: PASS (unchanged behavior).
Run: `pnpm --filter @propertypro/admin exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/lib/clients/website.ts
git commit -m "$(printf 'Repoint admin website helper at shared custom-domain validator\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 1.3: PR1 final-verify + open PR

- [ ] Run: `pnpm --filter @propertypro/shared exec vitest run src/site/custom-domain.test.ts && pnpm --filter @propertypro/admin exec vitest run __tests__/clients/website-status.test.ts`
- [ ] Push, `gh pr create --base main`, poll `gh pr checks <n>` until no "pending", squash-merge, verify with `gh pr view <n> --json state,mergeCommit`.

---

# PR2 — Schema (migration 0012) + flag enablement + env docs

**Branch:** `claude/custom-domain-2-schema`
**Net effect:** columns + index + flag on. Inert (no consumer yet).

### Task 2.1: Add the columns to the Drizzle schema

**Files:**
- Modify: `packages/db/src/schema/communities.ts` (near `customDomain` at line ~76)

- [ ] **Step 1: Add the columns**

After the `customDomain` column add:

```ts
  /** Phase 2: lifecycle of the custom domain — null | 'pending' | 'active' | 'error'. */
  customDomainStatus: text('custom_domain_status'),
  /** Phase 2: when the custom domain first became active. */
  customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
```

- [ ] **Step 2: Cache-free typecheck the db package**

Run: `pnpm --filter @propertypro/db exec tsc --noEmit`
Expected: no errors.

### Task 2.2: Write migration 0012 (hand-authored; partial unique index)

**Files:**
- Create: `packages/db/migrations/0012_custom_domain_status.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Verify no existing non-NULL duplicate custom_domain values** (data-safety; spec data-safety note)

Run (with env): `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; /* or psql */"`
Simpler: run the SQL directly against the DB:
```sql
SELECT custom_domain, count(*) FROM communities
WHERE custom_domain IS NOT NULL AND deleted_at IS NULL
GROUP BY custom_domain HAVING count(*) > 1;
```
Expected: 0 rows. (If any rows, resolve duplicates before proceeding.)

- [ ] **Step 2: Write the migration SQL**

```sql
-- 0012_custom_domain_status.sql
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "custom_domain_status" text;
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "custom_domain_verified_at" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "communities_custom_domain_unique"
  ON "communities" ("custom_domain")
  WHERE "custom_domain" IS NOT NULL AND "deleted_at" IS NULL;
```

- [ ] **Step 3: Add the journal entry**

In `packages/db/migrations/meta/_journal.json`, append a new entry after the last one (keep the file **TAB-indented**; bump `idx` to the next integer; `tag` = `0012_custom_domain_status`; copy the `version`/`when` shape of the previous entry, using a fixed timestamp consistent with neighbors).

- [ ] **Step 4: Apply locally + verify**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: migration 0012 applies cleanly.
Re-run to confirm idempotency (the `IF NOT EXISTS` clauses): Expected no error.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/communities.ts packages/db/migrations/0012_custom_domain_status.sql packages/db/migrations/meta/_journal.json
git commit -m "$(printf 'Add custom_domain status columns + partial unique index (migration 0012)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 2.3: Enable the feature flag (mirror hasSiteCustomCss)

**Files:**
- Modify: `packages/shared/src/features/plan-features.ts`
- Modify: `packages/shared/src/features/community-features.ts`
- Test: `packages/shared/src/features/get-features.test.ts` (existing — add cases)

- [ ] **Step 1: Write the failing test** (append cases to the existing feature test file)

```ts
it('enables hasSiteCustomDomain only on Pro+ plans', () => {
  expect(getEffectiveFeatures('condo_718', 'professional').hasSiteCustomDomain).toBe(true);
  expect(getEffectiveFeatures('condo_718', 'operations_plus').hasSiteCustomDomain).toBe(true);
  expect(getEffectiveFeatures('condo_718', 'essentials').hasSiteCustomDomain).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @propertypro/shared exec vitest run src/features/get-features.test.ts`
Expected: FAIL — `essentials` already false (ok) but professional/operations_plus currently false.

- [ ] **Step 3: Flip the flags**

In `community-features.ts` set `hasSiteCustomDomain: true` for `condo_718`, `hoa_720`, `apartment` (the lines currently `false` at ~52/83/114).
In `plan-features.ts` add `hasSiteCustomDomain: true` to the `features` block of `professional` and `operations_plus` (alongside `hasSitePolishBlocks`/`hasSiteCustomCss`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @propertypro/shared exec vitest run src/features/get-features.test.ts && pnpm --filter @propertypro/shared build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/features/plan-features.ts packages/shared/src/features/community-features.ts packages/shared/src/features/get-features.test.ts
git commit -m "$(printf 'Enable hasSiteCustomDomain on Pro+ plans\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task 2.4: Document env vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add a documented block** (near the existing Vercel/cookie section ~line 80-110)

```bash
# --- Custom domains (Phase 2, Pro+) ---
# Vercel Domains API. Canonical Vercel CLI names; VERCEL_ORG_ID is team-scoped
# (team_…) so Domains API calls pass ?teamId=$VERCEL_ORG_ID.
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_ORG_ID=
# Bare host (NO scheme, NO trailing slash). Base-domain discriminator for
# custom-domain routing + own-domain blocklist. Dev: localhost:3000.
NEXT_PUBLIC_ROOT_DOMAIN=getpropertypro.com
```

- [ ] **Step 2: Commit + PR2 final-verify**

```bash
git add .env.example
git commit -m "$(printf 'Document VERCEL_* and NEXT_PUBLIC_ROOT_DOMAIN for custom domains\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```
Then: `pnpm lint` (migration-ordering + db-access guards), push, poll checks, squash-merge.

---

# PR3 — Vercel Domains client

**Branch:** `claude/custom-domain-3-vercel-client`
**Net effect:** internal lib + tests. Dark. **Never imported by middleware.**

### Task 3.1: Implement the client

**Files:**
- Create: `apps/web/src/lib/domains/vercel-domains-client.ts`
- Test: `apps/web/__tests__/lib/domains/vercel-domains-client.test.ts`

- [ ] **Step 1: Write the failing test** (mock `fetch`)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addProjectDomain,
  getDomainStatus,
  removeProjectDomain,
  DomainProvisioningUnavailableError,
} from '@/lib/domains/vercel-domains-client';

const ENV = { VERCEL_TOKEN: 't0ken', VERCEL_PROJECT_ID: 'prj_x', VERCEL_ORG_ID: 'team_y' };

beforeEach(() => { Object.assign(process.env, ENV); vi.restoreAllMocks(); });
afterEach(() => { for (const k of Object.keys(ENV)) delete (process.env as Record<string,string>)[k]; });

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }) as Response,
  );
}

describe('vercel-domains-client', () => {
  it('throws when env is unconfigured', async () => {
    delete (process.env as Record<string,string>).VERCEL_TOKEN;
    await expect(addProjectDomain('www.foo.com')).rejects.toBeInstanceOf(DomainProvisioningUnavailableError);
  });

  it('adds a domain and passes teamId + bearer token', async () => {
    const spy = mockFetch(200, { name: 'www.foo.com', verified: false, verification: [{ type: 'TXT', domain: '_vercel.foo.com', value: 'abc' }] });
    const res = await addProjectDomain('www.foo.com');
    expect(res.records.length).toBeGreaterThan(0);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain('/v10/projects/prj_x/domains');
    expect(String(url)).toContain('teamId=team_y');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer t0ken' });
  });

  it('maps verified+configured to active', async () => {
    mockFetch(200, { name: 'www.foo.com', verified: true, misconfigured: false });
    expect((await getDomainStatus('www.foo.com')).status).toBe('active');
  });

  it('maps unverified/misconfigured to pending', async () => {
    mockFetch(200, { name: 'www.foo.com', verified: true, misconfigured: true });
    expect((await getDomainStatus('www.foo.com')).status).toBe('pending');
  });

  it('treats an already-exists add as idempotent success', async () => {
    mockFetch(409, { error: { code: 'domain_already_in_use' } });
    await expect(addProjectDomain('www.foo.com')).resolves.toBeTruthy();
  });

  it('removes a domain', async () => {
    const spy = mockFetch(200, { });
    await removeProjectDomain('www.foo.com');
    const [url, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('DELETE');
    expect(String(url)).toContain('/v9/projects/prj_x/domains/www.foo.com');
  });
});
```

- [ ] **Step 2: Run → fail** (`@/lib/domains/vercel-domains-client` missing).
  Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lib/domains/vercel-domains-client.test.ts`

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/domains/vercel-domains-client.ts
// NODE RUNTIME ONLY. Must never be imported by middleware.ts (edge).

export class DomainProvisioningUnavailableError extends Error {}
export class DomainProviderError extends Error {
  constructor(message: string, readonly providerCode?: string) { super(message); }
}

export type DomainStatus = 'pending' | 'active' | 'error';
export interface DnsRecord { type: string; name: string; value: string; }
export interface DomainStatusResult { status: DomainStatus; records: DnsRecord[]; reason?: string; }

function config() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ORG_ID;
  if (!token || !projectId) throw new DomainProvisioningUnavailableError('Custom-domain provisioning is not configured.');
  return { token, projectId, teamId };
}

function teamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function call(path: string, init: RequestInit & { teamId?: string }): Promise<{ status: number; body: any }> {
  const { token, teamId } = config();
  const res = await fetch(`https://api.vercel.com${path}${teamQuery(teamId)}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function toRecords(verification: unknown): DnsRecord[] {
  if (!Array.isArray(verification)) return [];
  return verification.map((v: any) => ({ type: v.type, name: v.domain, value: v.value }));
}

function mapStatus(body: any): DomainStatus {
  if (body?.verified === true && body?.misconfigured !== true) return 'active';
  return 'pending';
}

export async function addProjectDomain(host: string): Promise<DomainStatusResult> {
  const { projectId } = config();
  const { status, body } = await call(`/v10/projects/${projectId}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  // Idempotent: a domain already in our project is fine.
  if (status === 409 && body?.error?.code === 'domain_already_in_use') {
    return getDomainStatus(host);
  }
  if (status >= 400) {
    return { status: 'error', records: [], reason: body?.error?.message ?? `Vercel error ${status}` };
  }
  return { status: mapStatus(body), records: toRecords(body?.verification) };
}

export async function getDomainStatus(host: string): Promise<DomainStatusResult> {
  const { projectId } = config();
  const { status, body } = await call(`/v9/projects/${projectId}/domains/${host}`, { method: 'GET' });
  if (status >= 400) return { status: 'error', records: [], reason: body?.error?.message ?? `Vercel error ${status}` };
  return { status: mapStatus(body), records: toRecords(body?.verification) };
}

export async function removeProjectDomain(host: string): Promise<void> {
  const { projectId } = config();
  const { status, body } = await call(`/v9/projects/${projectId}/domains/${host}`, { method: 'DELETE' });
  if (status >= 400 && status !== 404) {
    throw new DomainProviderError(body?.error?.message ?? `Vercel error ${status}`, body?.error?.code);
  }
}
```

> **PR5 note:** the exact `verified`/`misconfigured`/`verification` field shape must be confirmed with one live `vercel domains inspect <host>` probe; adjust `mapStatus`/`toRecords` if the live payload differs. The 3-state contract does not change.

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** (`Add Vercel Domains client (node-runtime)`).
- [ ] **Step 6: PR3 final-verify:** cache-free `pnpm --filter @propertypro/web exec tsc --noEmit`; push; checks; squash-merge.

---

# PR4 — Base-domain-aware middleware routing

**Branch:** `claude/custom-domain-4-middleware`
**Net effect:** the riskiest slice. Serves nothing until active rows exist. Subdomain routing must not regress.

### Task 4.1: Make `resolveCommunityContext` base-domain aware (pure)

**Files:**
- Modify: `packages/shared/src/middleware/subdomain-router.ts`
- Test: `packages/shared/src/middleware/subdomain-router.test.ts` (existing — add cases)

- [ ] **Step 1: Write failing tests**

```ts
it('classifies a foreign host as a custom domain', () => {
  const r = resolveCommunityContext({ host: 'www.sunsetcondos.com', rootDomain: 'getpropertypro.com' });
  expect(r.source).toBe('custom_domain');
  expect(r.customDomainHost).toBe('www.sunsetcondos.com');
});
it('keeps a root-domain subdomain on the existing path', () => {
  const r = resolveCommunityContext({ host: 'sunset-condos.getpropertypro.com', rootDomain: 'getpropertypro.com' });
  expect(r.source).toBe('host_subdomain');
  expect(r.tenantSlug).toBe('sunset-condos');
});
it('does not treat the apex/root as a custom domain', () => {
  const r = resolveCommunityContext({ host: 'getpropertypro.com', rootDomain: 'getpropertypro.com' });
  expect(r.source).not.toBe('custom_domain');
});
it('lowercases the custom host', () => {
  const r = resolveCommunityContext({ host: 'WWW.Foo.com', rootDomain: 'getpropertypro.com' });
  expect(r.customDomainHost).toBe('www.foo.com');
});
```

- [ ] **Step 2: Run → fail** (`rootDomain`/`customDomainHost` not supported).

- [ ] **Step 3: Implement** — extend the input + result types and add the custom-domain branch:

```ts
// add to ResolveCommunityContextInput
  rootDomain?: string | null;

// add to CommunityContextSource union
  | 'custom_domain'

// add to ResolvedCommunityContext
  customDomainHost: string | null;

// helper
function foreignHost(host: string | null | undefined, rootDomain: string | null | undefined): string | null {
  if (!host || !rootDomain) return null;
  const h = host.split(':')[0]?.trim().toLowerCase() ?? '';
  const root = rootDomain.split(':')[0]?.trim().toLowerCase() ?? '';
  if (!h || !root) return null;
  if (h === 'localhost' || h.endsWith('.localhost')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  if (h === root || h.endsWith(`.${root}`)) return null; // under our root → not custom
  if (!h.includes('.')) return null;
  return h;
}
```

At the **top** of `resolveCommunityContext`, before the existing host-subdomain block, add:

```ts
  const custom = foreignHost(input.host, input.rootDomain);
  if (custom) {
    return { source: 'custom_domain', communityId: null, tenantSlug: null, isReservedSubdomain: false, customDomainHost: custom };
  }
```

Add `customDomainHost: null` to every other `return` object in the function.

- [ ] **Step 4: Run → pass.** Run: `pnpm --filter @propertypro/shared exec vitest run src/middleware/subdomain-router.test.ts && pnpm --filter @propertypro/shared build`
- [ ] **Step 5: Commit** (`Add base-domain-aware custom-domain detection to resolver`).

### Task 4.2: Wire the foreign-host lookup into middleware

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Add a custom-domain lookup helper** (mirrors `findCommunityIdBySlug` ~line 286; reuses the tenant cache but **positive-only**)

```ts
async function findCommunityIdByCustomDomain(
  supabase: Awaited<ReturnType<typeof createMiddlewareClient>>['supabase'],
  host: string,
): Promise<number | null> {
  const key = `cd:${host}`;
  const cached = readTenantCache(key);
  if (cached !== undefined && cached !== null) return cached; // positive-only: ignore cached null
  const { data, error } = await supabase
    .from('communities')
    .select('id')
    .eq('custom_domain', host)
    .eq('custom_domain_status', 'active')
    .is('deleted_at', null)
    .limit(1);
  if (error) throw new Error(error.message);
  const id = typeof data?.[0]?.id === 'number' ? data[0].id : null;
  if (id !== null) writeTenantCache(key, id); // cache positives only
  return id;
}
```

- [ ] **Step 2: Pass `rootDomain` into the resolver and handle the custom source on the `/` branch**

At each `resolveCommunityContext({ ... })` call site, add `rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com'`.

Inside the `if (pathname === '/')` block (~line 623), **before** the existing slug resolution, handle the custom source — and **skip the authed→dashboard redirect** for custom hosts:

```ts
if (tenantContext.source === 'custom_domain' && tenantContext.customDomainHost) {
  try {
    const communityId = await findCommunityIdByCustomDomain(supabase, tenantContext.customDomainHost);
    if (communityId != null) {
      forwardedHeaders.set(COMMUNITY_ID_HEADER, String(communityId));
      forwardedHeaders.set(TENANT_SOURCE_HEADER, 'custom_domain');
      const siteUrl = request.nextUrl.clone();
      siteUrl.pathname = '/public-site';
      const publicSiteResponse = NextResponse.rewrite(siteUrl, { request: { headers: forwardedHeaders } });
      return finaliseResponse(response as unknown as NextResponse, publicSiteResponse, requestId, origin, isApi, false);
    }
  } catch {
    // non-fatal — fall through to the default handling
  }
}
```

(Place this so an unresolved custom host falls through to the existing behavior — no auth-split, no redirect.)

- [ ] **Step 3: Build the web app** (middleware change → real build catches edge issues)

Run: `pnpm --filter @propertypro/web build` (placeholder env). Expected: build succeeds; **no** `node:`/Vercel-client import pulled into the edge bundle.

- [ ] **Step 4: Commit** (`Route verified custom domains to the public site`).
- [ ] **Step 5: PR4 final-verify:** `pnpm --filter @propertypro/web exec tsc --noEmit`; existing subdomain/middleware tests green (`pnpm --filter @propertypro/web exec vitest run __tests__/middleware`); push; checks; squash-merge.

---

# PR5 — Domain service + A1 routes

**Branch:** `claude/custom-domain-5-routes`
**Net effect:** the write path. Gated; dark without UI.

### Task 5.1: Extend the AuditAction union

**Files:** Modify `packages/db/src/utils/audit-logger.ts` (the `AuditAction` union ~line 12)

- [ ] Add `| 'custom_domain_set' | 'custom_domain_verified' | 'custom_domain_removed'` to the union. Run `pnpm --filter @propertypro/db exec tsc --noEmit` (expect clean) + `pnpm --filter @propertypro/db build`. Commit (`Add custom_domain_* audit actions`).
- [ ] Confirm the DB `action` column is `text` (not a pg-enum/CHECK): `grep -rn "action" packages/db/migrations/0000_nappy_guardian.sql | grep -i "audit"`. If it is constrained, that's a migration — escalate. (Expected: plain text.)

### Task 5.2: Domain service

**Files:**
- Create: `apps/web/src/lib/services/custom-domain-service.ts`
- Test: `apps/web/__tests__/lib/services/custom-domain-service.test.ts` (mock the Vercel client + `createUnscopedClient`)

- [ ] **Step 1: Write failing tests** covering: `setDomain` rejects when one already configured (→ `DomainAlreadyConfiguredError`); rejects own-domain/invalid (→ from `assertCustomDomainAllowed`); rejects duplicate host (unique-violation → `DomainAlreadyClaimedError`); happy path writes `custom_domain` + `status='pending'` + audit; `verifyDomain` promotes to active + stamps `verified_at`; `removeDomain` calls `removeProjectDomain` + nulls columns + audit. Mock `@/lib/domains/vercel-domains-client` and `@propertypro/db/unsafe`.

- [ ] **Step 2: Implement** — orchestration using `createUnscopedClient()` (root-table write, mirrors `branding.ts`), `assertCustomDomainAllowed(raw, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com')`, the Vercel client, and `logAuditEvent`. Exposed functions: `getDomain(communityId)`, `setDomain(communityId, userId, rawHost)`, `verifyDomain(communityId, userId)`, `removeDomain(communityId, userId)`. Translate a PG unique-violation (code `23505`) on the `communities_custom_domain_unique` index into `DomainAlreadyClaimedError`.

- [ ] **Step 3–5:** run → pass; commit (`Add custom-domain service`).

### Task 5.3: A1 contracts + routes

**Files:**
- Create: `apps/web/src/app/api/v1/pm/site/domain/contract.ts`
- Create: `apps/web/src/app/api/v1/pm/site/domain/route.ts`
- Create: `apps/web/src/app/api/v1/pm/site/domain/verify/contract.ts`
- Create: `apps/web/src/app/api/v1/pm/site/domain/verify/route.ts`
- Test: `apps/web/__tests__/api/pm-site-domain.test.ts`

- [ ] **Step 1: Contracts** (mirror `pm/site/hero/contract.ts` — declare `permission: { resource: 'settings', action }`):

```ts
import { defineRoute, z } from '@propertypro/api-contract';

const dnsRecord = z.object({ type: z.string(), name: z.string(), value: z.string() });
const domainStateSchema = z.object({
  domain: z.string().nullable(),
  status: z.enum(['pending', 'active', 'error']).nullable(),
  verifiedAt: z.string().nullable(),
  records: z.array(dnsRecord),
  reason: z.string().nullable(),
});

export const domainGetContract = defineRoute({
  method: 'GET', path: '/api/v1/pm/site/domain',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: domainStateSchema,
  permission: { resource: 'settings', action: 'read' },
});

export const domainSetContract = defineRoute({
  method: 'POST', path: '/api/v1/pm/site/domain',
  request: { body: z.object({ communityId: z.number().int().positive(), domain: z.string().min(1).max(253) }) },
  response: domainStateSchema,
  permission: { resource: 'settings', action: 'write' },
});

export const domainDeleteContract = defineRoute({
  method: 'DELETE', path: '/api/v1/pm/site/domain',
  request: { body: z.object({ communityId: z.number().int().positive() }) },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
```

verify/contract.ts: a POST at `/api/v1/pm/site/domain/verify`, body `{ communityId }`, response `domainStateSchema`, `permission: { resource: 'settings', action: 'write' }`.

- [ ] **Step 2: Handlers** — every handler runs the D9 auth chain then calls the service:

```ts
// route.ts (GET/POST/DELETE) — verify/route.ts mirrors POST
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole } from '@/lib/api/role-guard';            // confirm exact export name/path
import { assertNotDemoGrace } from '@/lib/api/demo-grace';      // confirm exact export name/path
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import * as svc from '@/lib/services/custom-domain-service';
import { domainGetContract, domainSetContract, domainDeleteContract } from './contract';

async function gate(req: Request, communityIdInput: number | null) {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req as any, communityIdInput);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, ['pm_admin', 'cam'], 'Only property managers can manage the custom domain');
  await requirePlanFeature(communityId, 'hasSiteCustomDomain');
  return { userId, communityId };
}

export const GET = withErrorHandler(runRoute(domainGetContract, async ({ query, req }) => {
  const { communityId } = await gate(req, query.communityId);
  return svc.getDomain(communityId);
}));

export const POST = withErrorHandler(runRoute(domainSetContract, async ({ body, req }) => {
  const { userId, communityId } = await gate(req, body.communityId);
  return svc.setDomain(communityId, userId, body.domain);
}));

export const DELETE = withErrorHandler(runRoute(domainDeleteContract, async ({ body, req }) => {
  const { userId, communityId } = await gate(req, body.communityId);
  await svc.removeDomain(communityId, userId);
  return { ok: true as const };
}));
```

> Confirm the exact import paths/names for `requireRole`, `assertNotDemoGrace`, `resolveEffectiveCommunityId` by grepping `pm/site/publish/route.ts` and `pm/branding/route.ts` imports — reuse theirs verbatim.

- [ ] **Step 3: Route tests** — `vi.mock('@/lib/services/custom-domain-service')` and the auth helpers; assert each gate returns the right status (cam allowed; owner/tenant → 403; demo-grace → 403; no plan → 403), set-when-exists → 409, duplicate → 409, happy path shapes. **Grep `vi.mock('@propertypro/db')` factories** in `apps/web/__tests__` for any new export you import — add it everywhere.

- [ ] **Step 4–6:** run → pass; `verify-contracts.ts` + `verify-scoped-db-access.ts`; cache-free web typecheck; commit (`Add custom-domain A1 routes`); push; checks; squash-merge.

---

# PR6 — PM settings UI

**Branch:** `claude/custom-domain-6-ui`
**Net effect:** exposes the feature. `'use client'` card; JSON-only (no server imports).

### Task 6.1: React-query hooks

**Files:**
- Create: `apps/web/src/hooks/use-custom-domain.ts`
- Test: `apps/web/__tests__/hooks/use-custom-domain.test.tsx`

- [ ] Implement `useCustomDomain(communityId)` (GET), `useSetDomain`, `useVerifyDomain`, `useRemoveDomain` using the existing query client + `requestJson` helper (mirror `use-hero-block.ts`). `import type` the response from `../app/api/v1/pm/site/domain/contract` (type-only, no runtime pull). Test loading/success/error with a mocked fetch. Commit.

### Task 6.2: CustomDomainCard component

**Files:**
- Create: `apps/web/src/components/pm/site-editor/CustomDomainCard.tsx`
- Test: `apps/web/__tests__/components/CustomDomainCard.test.tsx`

- [ ] **Step 1: Write failing RTL tests** — renders: (a) gated upsell ("Custom domain (Pro)") disabled when `hasSiteCustomDomain` is false; (b) empty state with a host input + "Add domain" when no domain; (c) pending state showing the DNS records table + "Check status" button + status pill; (d) active state with a green "Live" pill + "View site"; (e) "Remove" when set. Use `getStatusConfig` from `docs/design-system/constants/status.ts` for pills; ensure focus ring not suppressed.

- [ ] **Step 2: Implement** the card per `.claude/rules/design.md` (Card radius md, status = icon+text+color, EmptyState with a constructive action, loading Skeleton, error AlertBanner). It calls the Task 6.1 hooks only — **no `@propertypro/db` / no Vercel client imports**.

- [ ] **Step 3–4:** run → pass.

### Task 6.3: Mount the card on the settings page

**Files:** Modify `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx`

- [ ] Render `<CustomDomainCard communityId={...} canUseCustomDomain={features.hasSiteCustomDomain} initial={...} />` in a `space-y-6` section (the page already computes `getEffectiveFeaturesForPage`). Pass the server-fetched initial state via `svc.getDomain` (server side) to avoid a flash.

- [ ] **Step 1: Real build** (client component + page): `pnpm --filter @propertypro/web build` (placeholder env). Expected: success, no server-only import in the client bundle.
- [ ] **Step 2:** `grep vi.mock('next/navigation')`-style: if the card uses any `next/navigation` hook, add it to existing mock factories in DB-gated tests (`site-page`, `mobile-home`). Run the full web vitest for touched areas.
- [ ] **Step 3:** Commit (`Add custom domain card to website settings`); push; checks; squash-merge.

### Task 6.4: Manual live smoke (post-merge, real Vercel)

- [ ] As a Pro PM (`/dev/agent-login?as=pm_admin`), open `/pm/settings/website`, add a test domain → see DNS records → (add CNAME at a registrar) → "Check status" → watch `pending → active` → confirm the host serves the public site and the subdomain still works → Remove → confirm released from the Vercel project.
- [ ] Demo/no-token sanity: confirm `POST` returns `503 DOMAIN_PROVISIONING_UNAVAILABLE`, not a crash.

---

## Self-review notes (author)

- **Spec coverage:** D1–D10 each map to a task — live Vercel (PR3), manual verify (PR5 verify route + PR6 button), single-host/remove-then-add (PR5 `setDomain` 409 + PR6 Add-xor-Remove), public-`/`-only (PR4 `/` branch only), columns-not-table (PR2), unscoped write (PR5 service), Remove-action release (PR5 `removeDomain`), env names + teamId (PR3 client), pm_admin+cam gate (PR5 `gate`), no-replace (PR5 + PR6).
- **Out of scope (unchanged):** apex+www pair, auth on custom host, cron polling, community-purge Vercel release.
- **Known just-in-time confirmations:** exact Vercel JSON field shape (PR3/PR5 live probe); exact import names for `requireRole`/`assertNotDemoGrace`/`resolveEffectiveCommunityId` (grep the sibling routes); audit `action` column is plain text (PR5 Task 5.1).

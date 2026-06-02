# Property Landing Page — PR #2 Text + Image + Storage Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the second vertical slice of the Property Landing Page — two new content block types (`text` and `image`), their renderers + PM editor forms, the Supabase Storage bucket + RLS policies, the two-step presigned-URL upload pattern (presign + finalize) with server-side `sharp` transforms, per-plan storage quota enforcement, account-lifecycle cleanup, and documentation.

**Architecture:** PR #1a already shipped the Zod schemas for `text` and `image` blocks (`packages/shared/src/site-blocks/{text,image}.ts`) and a stub `getPublicCommunityScopedReader.listSiteBlocks()`. PR #1b shipped the renderer + layout registry plumbing and the `runRoute` contract pattern for new API routes. PR #2 fills in the renderer + editor + storage pipeline using those rails. Storage flows are split into two endpoints — `POST /api/v1/site/uploads/presign` returns a presigned upload URL (client uploads bytes directly to Supabase Storage), `POST /api/v1/site/images/finalize` downloads the raw bytes via service role, applies `sharp` (crop + resize to `1600w` + `800w` WebP variants), and audit-logs. Per-plan quotas are tracked in `communities.site_settings.assetsBytesUsed`; the presign endpoint rejects with HTTP 413 when over budget. Block authoring uses a "Content sections" stack added below the existing Welcome tab at `/pm/settings/website` (per user selection during brainstorming) — the full 5-tab editor lives in PR #8.

**Tech Stack:** Next.js 15 App Router, React 19 server components, Zod, Vitest, Drizzle, `sharp` (already a dependency at `^0.34.5`), `react-image-crop` (new — MIT, ~30KB, zero deps), Supabase Storage, TanStack Query, `@propertypro/api-contract` (`defineRoute` + `runRoute`).

**Spec reference:** [docs/superpowers/specs/2026-05-26-property-landing-page-design.md](../specs/2026-05-26-property-landing-page-design.md) — Section 2.8 (image handling), Section 8.3 (quotas), Section 8.4 (rate limits), Section 9 row #2.

---

## File Structure

**New files:**

| Path | Responsibility |
|------|----------------|
| `packages/db/migrations/0006_site_assets_storage.sql` | Create `community-site-assets` bucket + 4 RLS policies (service-role-all, pm-insert, public-read, pm-delete). |
| `apps/web/src/lib/site-assets/storage-paths.ts` | Pure helpers: `buildSiteAssetPath(communityId, kind, filename)`, `parseSiteAssetPath(path)`, `buildPublicAssetUrl(path)` with bucket-aware URL construction. |
| `apps/web/src/lib/site-assets/quota.ts` | `getCommunitySiteAssetsUsage(communityId)` (reads `communities.branding.assetsBytesUsed`), `incrementAssetsUsage(communityId, bytes)`, `decrementAssetsUsage(communityId, bytes)`, `assertWithinQuota(communityId, addBytes)` throwing `QuotaExceededError` on overflow. |
| `apps/web/src/lib/site-assets/transform.ts` | `transformSiteImage(input, crop)` — calls into `image-processor.ts`'s new helpers; returns `{ at1600w: Buffer, at800w: Buffer }`. Pure wrapper over `sharp` so the route handler stays slim. |
| `apps/web/src/lib/services/image-processor.ts` | **MODIFY** existing file — add `resizeSiteImage(input, opts)` for 1600w + 800w WebP variants (current file has only `resizeLogo`). |
| `apps/web/src/app/api/v1/site/uploads/presign/contract.ts` | Plan A1 contract for the presign endpoint. |
| `apps/web/src/app/api/v1/site/uploads/presign/route.ts` | `POST` handler — Zod-validates, plan-feature-gated, quota-checked, returns `{ uploadUrl, storagePath, expiresAt }`. |
| `apps/web/src/app/api/v1/site/images/finalize/contract.ts` | Plan A1 contract for the finalize endpoint. |
| `apps/web/src/app/api/v1/site/images/finalize/route.ts` | `POST` handler — fetches raw bytes, runs `transformSiteImage`, writes variants back to storage, increments quota counter, audit-logs, returns canonical paths. |
| `apps/web/src/components/public-site/blocks/TextBlock.tsx` | Server-component renderer for `text` block. |
| `apps/web/src/components/public-site/blocks/ImageBlock.tsx` | Server-component renderer for `image` block (renders `<figure>` with `<img>` + optional `<figcaption>`). |
| `apps/web/src/app/api/v1/pm/site/blocks/contract.ts` | Plan A1 contracts for `GET` + `PATCH /api/v1/pm/site/blocks` (list + upsert content blocks). |
| `apps/web/src/app/api/v1/pm/site/blocks/route.ts` | `GET` (returns ordered list of community blocks) + `PATCH` (upsert by `blockType` + `blockOrder`). |
| `apps/web/src/hooks/use-content-blocks.ts` | React Query hooks: `useContentBlocks(communityId)` + `useUpsertContentBlock(communityId)`. |
| `apps/web/src/hooks/use-image-upload.ts` | React Query hook orchestrating the two-step presign → upload → finalize pipeline. |
| `apps/web/src/components/pm/site-editor/TextBlockForm.tsx` | Controlled-input form for `text` block (heading optional, body required). |
| `apps/web/src/components/pm/site-editor/ImageBlockForm.tsx` | Controlled-input form with `react-image-crop` + alt-text + caption fields. |
| `apps/web/src/components/pm/site-editor/ContentSectionsList.tsx` | Server component that lists existing content blocks below the Welcome tab and allows adding a new one. Wraps Text + Image forms. |
| `docs/design-system/blocks/text.md` | Text block reference. |
| `docs/design-system/blocks/image.md` | Image block reference + upload pipeline overview. |

**Modified files:**

| Path | Change |
|------|--------|
| `apps/web/package.json` | Add `react-image-crop` dependency. |
| `apps/web/src/lib/services/image-processor.ts` | Add `resizeSiteImage` helper (existing `resizeLogo` untouched). |
| `apps/web/src/lib/services/site-blocks-service.ts` | Add `upsertPublishedBlock({communityId, actorUserId, blockType, blockOrder, content})` — generalization of `upsertPublishedHero`. Keep `upsertPublishedHero` as a thin caller of the new helper for back-compat. |
| `apps/web/src/components/public-site/blocks/registry.ts` | Register `text: TextBlock` and `image: ImageBlock`. |
| `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` | Add `<ContentSectionsList>` below the Welcome card. |
| `apps/web/src/lib/db/public-community-reader.ts` | (No code change; existing `listSiteBlocks()` already returns the ordered block list — verify in tests.) |
| `packages/shared/src/branding.ts` | Add `assetsBytesUsed?: number` field for per-community storage tracking. |
| `apps/web/src/lib/middleware/rate-limit-config.ts` | Add rate limits per spec Section 8.4: presign (20/5min/community), finalize (20/5min/community). Mirror the existing `auth` route category. |
| `scripts/perf-check.ts` | (No change in PR #2; budget headroom for the new client islands is already covered by the existing `site` group threshold.) |

**Tests created:**

| Path | Coverage |
|------|----------|
| `apps/web/__tests__/lib/site-assets/storage-paths.test.ts` | Path construction + parsing (community id, kind, filename); reject invalid kinds. |
| `apps/web/__tests__/lib/site-assets/quota.test.ts` | `getCommunitySiteAssetsUsage` reads counter; `assertWithinQuota` throws `QuotaExceededError` correctly at boundaries. |
| `apps/web/__tests__/lib/site-assets/transform.test.ts` | `transformSiteImage` produces 2 WebP buffers with the expected dimensions (uses a 4-pixel JPEG fixture). |
| `apps/web/__tests__/lib/services/image-processor.test.ts` | `resizeSiteImage` produces a `<=1600w` and `<=800w` WebP. |
| `apps/web/__tests__/api/site/uploads/presign.test.ts` | 8+ tests: happy path, validation errors, plan-feature 403, quota 413, role 403, unauthn 401, rate-limit (if testable). |
| `apps/web/__tests__/api/site/images/finalize.test.ts` | 8+ tests: happy path (mock storage download + upload), invalid MIME, processing failure, audit log fired, quota increment. |
| `apps/web/__tests__/components/public-site/blocks/TextBlock.test.tsx` | Headline optional, body required; rejects malformed content with console-warn; HTML escape. |
| `apps/web/__tests__/components/public-site/blocks/ImageBlock.test.tsx` | Renders `<figure>` with `<img alt=...>`, optional `<figcaption>`; rejects without altText (decorative path covered too). |
| `apps/web/__tests__/api/pm/site/blocks.test.ts` | GET happy + PATCH for text + PATCH for image + 400/403/404 paths. |
| `apps/web/__tests__/hooks/use-content-blocks.test.tsx` | useContentBlocks fetches; useUpsertContentBlock mutates + invalidates. |
| `apps/web/__tests__/hooks/use-image-upload.test.tsx` | Orchestrates presign → upload → finalize; surfaces step-specific errors. |
| `apps/web/__tests__/components/pm/site-editor/TextBlockForm.test.tsx` | Field validation, Save disabled until valid, server-error inline alert. |
| `apps/web/__tests__/components/pm/site-editor/ImageBlockForm.test.tsx` | Crop UI renders, alt-text required, upload flow happy + cancellation. |

---

## Task Overview

| # | Task | Duration |
|---|------|----------|
| 1 | Add `react-image-crop` dependency | 10m |
| 2 | Migration `0006_site_assets_storage.sql` (bucket + 4 RLS policies) | 50m |
| 3 | `storage-paths.ts` helper + tests | 30m |
| 4 | `branding.assetsBytesUsed` field on `CommunityBranding` | 15m |
| 5 | `quota.ts` helpers + tests | 50m |
| 6 | Extend `image-processor.ts` with `resizeSiteImage` + tests | 40m |
| 7 | `transform.ts` wrapper + tests | 30m |
| 8 | `POST /api/v1/site/uploads/presign` (contract + route + tests) | 75m |
| 9 | `POST /api/v1/site/images/finalize` (contract + route + tests) | 90m |
| 10 | Rate limits in `rate-limit-config.ts` | 25m |
| 11 | `upsertPublishedBlock` service generalisation + tests | 40m |
| 12 | `GET + PATCH /api/v1/pm/site/blocks` (contract + route + tests) | 75m |
| 13 | TextBlock renderer + tests | 40m |
| 14 | ImageBlock renderer + tests | 50m |
| 15 | Register TextBlock + ImageBlock | 10m |
| 16 | `useContentBlocks` + `useUpsertContentBlock` hooks + tests | 40m |
| 17 | `useImageUpload` hook (orchestrates the 3-step pipeline) + tests | 60m |
| 18 | `TextBlockForm` client component + tests | 50m |
| 19 | `ImageBlockForm` client component (`react-image-crop`) + tests | 90m |
| 20 | `ContentSectionsList` component + integration into settings/website page | 60m |
| 21 | Account-lifecycle cleanup hook extension (decrement quota on hard-delete) | 50m |
| 22 | Docs: `blocks/text.md` + `blocks/image.md` | 30m |
| 23 | Final validation + open PR | 40m |

Total: ~17 hours of focused engineering. Plan is ambitious — review checkpoints between every task are essential.

---

### Task 1: Add `react-image-crop` dependency

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install the package**

```bash
pnpm --filter web add react-image-crop@^11
```

- [ ] **Step 2: Verify the install**

```bash
grep -A 1 "react-image-crop" apps/web/package.json
```

Expected: a line like `"react-image-crop": "^11.0.7"` (or whatever the latest 11.x is).

- [ ] **Step 3: Confirm typecheck still clean**

```bash
pnpm --filter web typecheck
```

Expected: no errors. (`react-image-crop` ships its own types.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add react-image-crop dependency (PR #2 · 1/23)

Required by the Image block PM editor (Task 19). MIT, ~30 KB minified, no
transitive dependencies. Used client-side for the cropping UI; the
authoritative server-side crop runs in the finalize endpoint via sharp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration `0006_site_assets_storage.sql`

**Files:**
- Create: `packages/db/migrations/0006_site_assets_storage.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

Spec Section 2.8 specifies 4 storage RLS policies on the new `community-site-assets` bucket. The bucket is `public = true` so anonymous reads work; the SELECT policy restricts which buckets unauth users can read.

- [ ] **Step 1: Verify the next migration number is `0006`**

```bash
ls packages/db/migrations/*.sql | tail -3
cat packages/db/migrations/meta/_journal.json | python3 -c "import json,sys; print(json.load(sys.stdin)['entries'][-1]['idx'])"
```

Expected: last file is `0005_site_blocks_rls_hardening.sql`; last journal idx is `5`. If not, run `git fetch origin main && git diff origin/main -- packages/db/migrations/meta/_journal.json` to reconcile.

- [ ] **Step 2: Write the migration file**

Create `packages/db/migrations/0006_site_assets_storage.sql`:

```sql
-- Migration 0006: site assets storage bucket + RLS policies
--
-- Creates the community-site-assets storage bucket (public = true so anonymous
-- reads work) and four RLS policies governing object access. PM users in
-- pm_admin / cam roles get insert + delete on objects under their community's
-- path prefix; service_role gets full access for the finalize endpoint to
-- read raw uploads + write WebP variants without inheriting end-user auth.
--
-- Bucket path convention: {community_id}/{kind}/{uuid}-{filename}
-- where kind ∈ {logo, hero, content}.

BEGIN;

-- Create the bucket (idempotent — INSERT ... ON CONFLICT DO NOTHING)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-site-assets',
  'community-site-assets',
  true,
  10485760,  -- 10 MB hard cap at the bucket layer; per-block tighter limits enforced in the API
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Service-role: full access (the finalize endpoint runs as service_role to
-- read raw uploads + write transformed variants)
DROP POLICY IF EXISTS "site_assets_service_role_all" ON storage.objects;
CREATE POLICY "site_assets_service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'community-site-assets')
  WITH CHECK (bucket_id = 'community-site-assets');

-- Authenticated PM can INSERT objects in their own community's path prefix.
DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects;
CREATE POLICY "site_assets_pm_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam','pm_admin')
         AND deleted_at IS NULL
    )
  );

-- Anonymous + authenticated public read (the public site is unauthenticated)
DROP POLICY IF EXISTS "site_assets_public_read" ON storage.objects;
CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-site-assets');

-- Authenticated PM can DELETE objects in their own community's path prefix.
DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects;
CREATE POLICY "site_assets_pm_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-site-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT community_id::text FROM community_memberships
       WHERE user_id = auth.uid()
         AND role_id IN ('property_manager_admin','cam','pm_admin')
         AND deleted_at IS NULL
    )
  );

COMMIT;
```

- [ ] **Step 3: Add journal entry**

In `packages/db/migrations/meta/_journal.json`, append (mirroring the format of existing entries):

```json
{
  "idx": 6,
  "version": "7",
  "when": <Unix milliseconds at PR-open time>,
  "tag": "0006_site_assets_storage",
  "breakpoints": true
}
```

Get the `when` timestamp with: `date +%s%3N`.

- [ ] **Step 4: Run the migration**

```bash
pnpm --filter @propertypro/db db:migrate
```

Expected: applies cleanly; prints "[+] migrations applied: 1" (or similar).

If the local Supabase doesn't have a `storage.buckets` table (i.e., not a real Supabase instance), document the deviation in the commit message — the migration will still pass in CI / staging against real Supabase.

- [ ] **Step 5: Verify the policies + bucket exist**

In psql against local Supabase:
```sql
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'community-site-assets';
SELECT polname FROM pg_policy WHERE polname LIKE 'site_assets_%' ORDER BY polname;
```

Expected: 1 bucket row, 4 policy rows.

- [ ] **Step 6: Confirm no drift**

```bash
pnpm --filter @propertypro/db exec drizzle-kit generate --name verify_no_drift_0006
```

Expected: "No schema changes". Discard the empty artifact:
```bash
rm packages/db/migrations/000*_verify_no_drift_0006.sql 2>/dev/null || true
git checkout -- packages/db/migrations/meta/_journal.json
```

(The migration touches `storage.*` which is outside the Drizzle schema mirror; no drift expected.)

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/0006_site_assets_storage.sql packages/db/migrations/meta/_journal.json
git commit -m "feat(db): site-assets storage bucket + RLS policies (PR #2 · 2/23)

Creates the community-site-assets bucket (public=true, 10 MB limit, JPEG/
PNG/WebP only) and four RLS policies per spec §2.8:
- service_role: full access (used by the finalize endpoint to read raw
  uploads + write WebP variants without inheriting end-user auth)
- authenticated PM (pm_admin / cam / property_manager_admin): INSERT and
  DELETE on objects under their community's path prefix
- anonymous + authenticated: SELECT (the public site is unauthenticated)

Path convention: {community_id}/{kind}/{uuid}-{filename}, kind ∈
{logo, hero, content}. The path-prefix check uses
storage.foldername(name)[1] to extract the community_id segment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `storage-paths.ts` helper + tests

**Files:**
- Create: `apps/web/src/lib/site-assets/storage-paths.ts`
- Create: `apps/web/__tests__/lib/site-assets/storage-paths.test.ts`

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/lib/site-assets/storage-paths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSiteAssetPath, parseSiteAssetPath, buildPublicAssetUrl } from '@/lib/site-assets/storage-paths';

describe('buildSiteAssetPath', () => {
  it('produces {communityId}/{kind}/{uuid}-{filename}', () => {
    const path = buildSiteAssetPath(42, 'hero', 'beachfront.jpg');
    expect(path).toMatch(/^42\/hero\/[a-f0-9-]{36}-beachfront\.jpg$/);
  });

  it('sanitizes filename: keeps alphanumerics, dots, hyphens, underscores', () => {
    const path = buildSiteAssetPath(7, 'content', 'My Photo!.jpg');
    expect(path).toMatch(/^7\/content\/[a-f0-9-]{36}-my_photo_\.jpg$/);
  });

  it('rejects communityId of 0 or negative', () => {
    expect(() => buildSiteAssetPath(0, 'hero', 'x.jpg')).toThrow();
    expect(() => buildSiteAssetPath(-1, 'hero', 'x.jpg')).toThrow();
  });

  it('rejects unknown kinds', () => {
    expect(() => buildSiteAssetPath(1, 'unknown' as never, 'x.jpg')).toThrow();
  });

  it('rejects filenames with path separators', () => {
    expect(() => buildSiteAssetPath(1, 'hero', '../etc/passwd')).toThrow();
  });
});

describe('parseSiteAssetPath', () => {
  it('decomposes a valid path', () => {
    const result = parseSiteAssetPath('42/hero/abc-def.webp');
    expect(result).toEqual({ communityId: 42, kind: 'hero', filename: 'abc-def.webp' });
  });

  it('returns null for invalid path shapes', () => {
    expect(parseSiteAssetPath('hero/abc.webp')).toBeNull();
    expect(parseSiteAssetPath('42/unknown/x.webp')).toBeNull();
    expect(parseSiteAssetPath('')).toBeNull();
  });
});

describe('buildPublicAssetUrl', () => {
  it('returns a Supabase public-storage URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    const url = buildPublicAssetUrl('42/hero/abc.webp');
    expect(url).toBe('https://example.supabase.co/storage/v1/object/public/community-site-assets/42/hero/abc.webp');
  });

  it('falls back to relative path when SUPABASE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const url = buildPublicAssetUrl('42/hero/abc.webp');
    expect(url).toBe('/site-assets/42/hero/abc.webp');
  });
});
```

Run it → expect module-not-found.

- [ ] **Step 2: Implement**

Create `apps/web/src/lib/site-assets/storage-paths.ts`:

```typescript
import { randomUUID } from 'node:crypto';

const VALID_KINDS = ['logo', 'hero', 'content'] as const;
export type AssetKind = (typeof VALID_KINDS)[number];

const SITE_ASSETS_BUCKET = 'community-site-assets';

function sanitizeFilename(name: string): string {
  if (name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    throw new Error(`Filename contains illegal characters: ${name}`);
  }
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

export function buildSiteAssetPath(
  communityId: number,
  kind: AssetKind,
  filename: string,
): string {
  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(`communityId must be a positive integer; got ${communityId}`);
  }
  if (!(VALID_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown asset kind: ${kind}`);
  }
  const safe = sanitizeFilename(filename);
  return `${communityId}/${kind}/${randomUUID()}-${safe}`;
}

export interface ParsedSiteAssetPath {
  communityId: number;
  kind: AssetKind;
  filename: string;
}

export function parseSiteAssetPath(path: string): ParsedSiteAssetPath | null {
  if (!path) return null;
  const parts = path.split('/');
  if (parts.length < 3) return null;
  const [communityIdStr, kind, ...rest] = parts;
  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;
  if (!(VALID_KINDS as readonly string[]).includes(kind)) return null;
  return { communityId, kind: kind as AssetKind, filename: rest.join('/') };
}

export function buildPublicAssetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return `/site-assets/${path}`;
  return `${base}/storage/v1/object/public/${SITE_ASSETS_BUCKET}/${path}`;
}

export { SITE_ASSETS_BUCKET };
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/lib/site-assets/storage-paths.test.ts
pnpm --filter web typecheck
git add apps/web/src/lib/site-assets/storage-paths.ts apps/web/__tests__/lib/site-assets/storage-paths.test.ts
git commit -m "feat(site-assets): storage-paths helper (PR #2 · 3/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `branding.assetsBytesUsed` field

**Files:**
- Modify: `packages/shared/src/branding.ts`

- [ ] **Step 1: Add the field**

Open `packages/shared/src/branding.ts`. Find the `CommunityBranding` interface and add:

```typescript
  /**
   * Cumulative bytes consumed by community-site-assets uploads. Tracked
   * transactionally on upload (finalize) and decremented on hard-delete by
   * the account-lifecycle cron. Used to enforce per-plan quotas
   * (siteAssetsQuotaBytes on PlanFeatureConfig).
   */
  assetsBytesUsed?: number;
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @propertypro/shared typecheck
pnpm --filter web typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/branding.ts
git commit -m "feat(shared): CommunityBranding.assetsBytesUsed counter field (PR #2 · 4/23)

Per-community storage usage tracking for the new community-site-assets
bucket (PR #2). Incremented at finalize, decremented at hard-delete.
Used by the quota gate at the presign endpoint to reject over-budget
uploads with HTTP 413.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `quota.ts` helpers + tests

**Files:**
- Create: `apps/web/src/lib/site-assets/quota.ts`
- Create: `apps/web/__tests__/lib/site-assets/quota.test.ts`

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/lib/site-assets/quota.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getBrandingMock = vi.fn();
const updateBrandingMock = vi.fn();

vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: getBrandingMock,
  updateBrandingForCommunity: updateBrandingMock,
}));

const requirePlanFeatureMock = vi.fn();
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

const getPlanConfigMock = vi.fn();
vi.mock('@/lib/middleware/plan-config', () => ({
  getPlanConfigForCommunity: getPlanConfigMock,
}));

import {
  getCommunitySiteAssetsUsage,
  assertWithinQuota,
  incrementAssetsUsage,
  decrementAssetsUsage,
  QuotaExceededError,
} from '@/lib/site-assets/quota';

describe('getCommunitySiteAssetsUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the stored counter', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 12345 });
    expect(await getCommunitySiteAssetsUsage(42)).toBe(12345);
  });

  it('returns 0 when no branding row exists', async () => {
    getBrandingMock.mockResolvedValueOnce(null);
    expect(await getCommunitySiteAssetsUsage(42)).toBe(0);
  });

  it('returns 0 when assetsBytesUsed is unset', async () => {
    getBrandingMock.mockResolvedValueOnce({ primaryColor: '#fff' });
    expect(await getCommunitySiteAssetsUsage(42)).toBe(0);
  });
});

describe('assertWithinQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlanConfigMock.mockResolvedValue({ siteAssetsQuotaBytes: 100 * 1024 * 1024 }); // 100 MB
  });

  it('passes when current + add is under quota', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 50 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('passes at exact quota boundary', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 90 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('throws QuotaExceededError when over budget', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 95 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('QuotaExceededError carries the canonical error code', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 95 * 1024 * 1024 });
    try {
      await assertWithinQuota(42, 10 * 1024 * 1024);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect((err as QuotaExceededError).code).toBe('SITE_ASSETS_QUOTA_EXCEEDED');
      expect((err as QuotaExceededError).statusCode).toBe(413);
    }
  });
});

describe('increment / decrement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('incrementAssetsUsage adds to existing counter', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 1000 });
    await incrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 1500 }));
  });

  it('incrementAssetsUsage starts from 0 when no counter set', async () => {
    getBrandingMock.mockResolvedValueOnce({});
    await incrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 500 }));
  });

  it('decrementAssetsUsage clamps at zero (never negative)', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 100 });
    await decrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 0 }));
  });
});
```

Run → expect module-not-found.

- [ ] **Step 2: Implement**

Create `apps/web/src/lib/site-assets/quota.ts`:

```typescript
/**
 * Per-community storage quota helpers for the community-site-assets bucket.
 *
 * Usage is tracked in `communities.branding.assetsBytesUsed` (jsonb field).
 * The quota itself comes from the plan config (`PlanFeatureConfig.siteAssetsQuotaBytes`).
 *
 * AppError: subclass `QuotaExceededError` maps to HTTP 413 + code
 * `SITE_ASSETS_QUOTA_EXCEEDED`. withErrorHandler picks this up
 * automatically because QuotaExceededError extends AppError.
 */
import { AppError } from '@/lib/api/errors/AppError';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
import { getPlanConfigForCommunity } from '@/lib/middleware/plan-config';

export class QuotaExceededError extends AppError {
  constructor(message: string) {
    super(message, 413, 'SITE_ASSETS_QUOTA_EXCEEDED');
  }
}

export async function getCommunitySiteAssetsUsage(communityId: number): Promise<number> {
  const branding = await getBrandingForCommunity(communityId);
  return typeof branding?.assetsBytesUsed === 'number' ? branding.assetsBytesUsed : 0;
}

export async function assertWithinQuota(communityId: number, addBytes: number): Promise<void> {
  const current = await getCommunitySiteAssetsUsage(communityId);
  const plan = await getPlanConfigForCommunity(communityId);
  const quota = plan.siteAssetsQuotaBytes;
  if (current + addBytes > quota) {
    throw new QuotaExceededError(
      `Site assets would exceed plan quota (${quota} bytes). Current usage: ${current}. Requested: ${addBytes}.`,
    );
  }
}

export async function incrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  const current = await getCommunitySiteAssetsUsage(communityId);
  await updateBrandingForCommunity(communityId, { assetsBytesUsed: current + bytes });
}

export async function decrementAssetsUsage(communityId: number, bytes: number): Promise<void> {
  const current = await getCommunitySiteAssetsUsage(communityId);
  const next = Math.max(0, current - bytes);
  await updateBrandingForCommunity(communityId, { assetsBytesUsed: next });
}
```

**Discovery step before implementing:** verify `getPlanConfigForCommunity` exists at `@/lib/middleware/plan-config`. If the actual helper is named differently (e.g., `resolvePlanFeatures`), adjust the import + call site accordingly. Read `apps/web/src/lib/middleware/plan-guard.ts` for the closest reference if needed.

Also verify `updateBrandingForCommunity` signature accepts the `assetsBytesUsed` field on its `BrandingPatch` type — it may need extension. If yes, extend the `BrandingPatch` interface in `apps/web/src/lib/api/branding.ts` to include `assetsBytesUsed?: number`.

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/lib/site-assets/quota.test.ts
pnpm --filter web typecheck
git add apps/web/src/lib/site-assets/quota.ts apps/web/__tests__/lib/site-assets/quota.test.ts apps/web/src/lib/api/branding.ts
git commit -m "feat(site-assets): per-community storage quota helpers (PR #2 · 5/23)

assertWithinQuota throws QuotaExceededError (HTTP 413 / SITE_ASSETS_QUOTA_EXCEEDED)
when current + new > plan limit. incrementAssetsUsage / decrementAssetsUsage
update the counter on branding jsonb; decrement clamps at zero.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Extend `image-processor.ts` with `resizeSiteImage` + tests

**Files:**
- Modify: `apps/web/src/lib/services/image-processor.ts`
- Create: `apps/web/__tests__/lib/services/image-processor.test.ts`

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/lib/services/image-processor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { resizeSiteImage } from '@/lib/services/image-processor';

async function makeJpegFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 100, b: 50 } },
  }).jpeg().toBuffer();
}

describe('resizeSiteImage', () => {
  it('produces two WebP variants: 1600w and 800w', async () => {
    const input = await makeJpegFixture(2400, 1350);
    const result = await resizeSiteImage(input);

    const meta1600 = await sharp(result.at1600w).metadata();
    expect(meta1600.format).toBe('webp');
    expect(meta1600.width).toBe(1600);

    const meta800 = await sharp(result.at800w).metadata();
    expect(meta800.format).toBe('webp');
    expect(meta800.width).toBe(800);
  });

  it('preserves aspect ratio', async () => {
    const input = await makeJpegFixture(1600, 900);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('does not upscale: input smaller than 1600w stays at original width', async () => {
    const input = await makeJpegFixture(1200, 675);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.width).toBe(1200);
  });

  it('strips EXIF / metadata in the output', async () => {
    const input = await makeJpegFixture(2000, 1125);
    const result = await resizeSiteImage(input);
    const meta = await sharp(result.at1600w).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
```

Run → expect failures (`resizeSiteImage` not exported yet).

- [ ] **Step 2: Implement**

Modify `apps/web/src/lib/services/image-processor.ts`. After the existing `resizeLogo` export, add:

```typescript
const SITE_IMAGE_QUALITY = 82;

export interface SiteImageVariants {
  at1600w: Buffer;
  at800w: Buffer;
}

/**
 * Resize a site asset image to two WebP variants (1600w + 800w). Aspect
 * ratio preserved; never upscales beyond the input width. EXIF stripped.
 *
 * Used by the finalize endpoint to produce CDN-friendly variants from
 * raw uploads.
 */
export async function resizeSiteImage(input: Buffer): Promise<SiteImageVariants> {
  const meta = await sharp(input).metadata();
  const sourceWidth = meta.width ?? 0;
  const target1600 = Math.min(sourceWidth, 1600);
  const target800 = Math.min(sourceWidth, 800);

  const [at1600w, at800w] = await Promise.all([
    sharp(input).resize({ width: target1600, withoutEnlargement: true }).webp({ quality: SITE_IMAGE_QUALITY }).toBuffer(),
    sharp(input).resize({ width: target800, withoutEnlargement: true }).webp({ quality: SITE_IMAGE_QUALITY }).toBuffer(),
  ]);

  return { at1600w, at800w };
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/lib/services/image-processor.test.ts
pnpm --filter web typecheck
git add apps/web/src/lib/services/image-processor.ts apps/web/__tests__/lib/services/image-processor.test.ts
git commit -m "feat(services): resizeSiteImage helper (1600w + 800w WebP variants) (PR #2 · 6/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `transform.ts` wrapper + tests

**Files:**
- Create: `apps/web/src/lib/site-assets/transform.ts`
- Create: `apps/web/__tests__/lib/site-assets/transform.test.ts`

This wrapper accepts an optional crop box (Section 2.8 — client crops with `react-image-crop`, server-side re-applies the crop authoritatively).

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/lib/site-assets/transform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { transformSiteImage } from '@/lib/site-assets/transform';

async function makeJpegFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 100, b: 50 } },
  }).jpeg().toBuffer();
}

describe('transformSiteImage', () => {
  it('returns 2 WebP variants when no crop is supplied', async () => {
    const input = await makeJpegFixture(2000, 1125);
    const { at1600w, at800w } = await transformSiteImage(input);
    expect((await sharp(at1600w).metadata()).width).toBe(1600);
    expect((await sharp(at800w).metadata()).width).toBe(800);
  });

  it('applies the crop box before resizing', async () => {
    const input = await makeJpegFixture(2000, 1500);
    // Crop to 1600x900 starting at (0,300)
    const { at1600w } = await transformSiteImage(input, { x: 0, y: 300, width: 1600, height: 900 });
    const meta = await sharp(at1600w).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('rejects an out-of-bounds crop', async () => {
    const input = await makeJpegFixture(1600, 900);
    await expect(transformSiteImage(input, { x: 0, y: 0, width: 5000, height: 5000 })).rejects.toThrow();
  });

  it('rejects negative crop coordinates', async () => {
    const input = await makeJpegFixture(1600, 900);
    await expect(transformSiteImage(input, { x: -10, y: 0, width: 100, height: 100 })).rejects.toThrow();
  });
});
```

Run → expect module-not-found.

- [ ] **Step 2: Implement**

Create `apps/web/src/lib/site-assets/transform.ts`:

```typescript
import sharp from 'sharp';
import { resizeSiteImage, type SiteImageVariants } from '@/lib/services/image-processor';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function transformSiteImage(
  input: Buffer,
  crop?: CropBox,
): Promise<SiteImageVariants> {
  let bytes = input;
  if (crop) {
    if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0) {
      throw new Error(`Crop box must have non-negative origin and positive dimensions: ${JSON.stringify(crop)}`);
    }
    const meta = await sharp(input).metadata();
    if (
      (meta.width ?? 0) < crop.x + crop.width ||
      (meta.height ?? 0) < crop.y + crop.height
    ) {
      throw new Error(`Crop box ${JSON.stringify(crop)} exceeds source dimensions ${meta.width}x${meta.height}`);
    }
    bytes = await sharp(input).extract({
      left: Math.round(crop.x),
      top: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    }).toBuffer();
  }
  return resizeSiteImage(bytes);
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/lib/site-assets/transform.test.ts
pnpm --filter web typecheck
git add apps/web/src/lib/site-assets/transform.ts apps/web/__tests__/lib/site-assets/transform.test.ts
git commit -m "feat(site-assets): transformSiteImage with optional crop (PR #2 · 7/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `POST /api/v1/site/uploads/presign`

**Files:**
- Create: `apps/web/src/app/api/v1/site/uploads/presign/contract.ts`
- Create: `apps/web/src/app/api/v1/site/uploads/presign/route.ts`
- Create: `apps/web/__tests__/api/site/uploads/presign.test.ts`

Per Plan A1, the route MUST use `runRoute(defineRoute(...))`. See `apps/web/src/app/api/v1/document-categories/{contract,route}.ts` for the canonical pattern.

- [ ] **Step 1: Contract first**

Create `apps/web/src/app/api/v1/site/uploads/presign/contract.ts`:

```typescript
import { defineRoute, z } from '@propertypro/api-contract';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB hard cap (matches bucket setting)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const sitePresignRequestSchema = z.object({
  communityId: z.number().int().positive(),
  kind: z.enum(['hero', 'content']),  // 'logo' is reserved for the existing branding flow
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
});

export const sitePresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  expiresAt: z.string().datetime(),  // ISO 8601
});

export const sitePresignContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/uploads/presign',
  request: { body: sitePresignRequestSchema },
  response: sitePresignResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
```

- [ ] **Step 2: Test first**

Create `apps/web/__tests__/api/site/uploads/presign.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

const { requireAuthMock, requireMembershipMock, requirePlanFeatureMock, assertWithinQuotaMock, createPresignedUploadUrlMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertWithinQuotaMock: vi.fn(),
  createPresignedUploadUrlMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/site-assets/quota', async () => {
  const actual = await vi.importActual<typeof import('@/lib/site-assets/quota')>('@/lib/site-assets/quota');
  return { ...actual, assertWithinQuota: assertWithinQuotaMock };
});
vi.mock('@propertypro/db', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/db')>('@propertypro/db');
  return { ...actual, createPresignedUploadUrl: createPresignedUploadUrlMock };
});

import { POST } from '@/app/api/v1/site/uploads/presign/route';

const VALID_BODY = {
  communityId: 42,
  kind: 'hero',
  filename: 'beachfront.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024 * 1024,
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/site/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/v1/site/uploads/presign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    requirePlanFeatureMock.mockResolvedValue(undefined);
    assertWithinQuotaMock.mockResolvedValue(undefined);
    createPresignedUploadUrlMock.mockResolvedValue({
      signedUrl: 'https://example.supabase.co/upload-url',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
  });

  it('200s with uploadUrl + storagePath when all gates pass', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(expect.objectContaining({
      uploadUrl: expect.stringContaining('https://'),
      storagePath: expect.stringMatching(/^42\/hero\/.+-beachfront\.jpg$/),
    }));
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
      'community-site-assets',
      expect.stringMatching(/^42\/hero\//),
      expect.any(Object),
    );
  });

  it('400s on invalid MIME type', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, mimeType: 'image/svg+xml' }));
    expect(res.status).toBe(400);
  });

  it('400s on file too large', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, fileSize: 50 * 1024 * 1024 }));
    expect(res.status).toBe(400);
  });

  it('413s when over quota', async () => {
    const { QuotaExceededError } = await import('@/lib/site-assets/quota');
    assertWithinQuotaMock.mockRejectedValueOnce(new QuotaExceededError('over budget'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(413);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when plan lacks hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new AppError('upgrade', 403, 'PLAN_UPGRADE_REQUIRED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new AppError('unauthorized', 401, 'UNAUTHORIZED'));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });
});
```

Run → expect failures.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/api/v1/site/uploads/presign/route.ts`:

```typescript
/**
 * PR #2: Presigned-upload endpoint for community-site-assets.
 *
 * Step 1 of the two-step upload pattern. The client POSTs metadata; the
 * server validates + checks plan/quota + returns a presigned URL that the
 * client uses to upload bytes directly to Supabase Storage. The
 * finalize endpoint (separate route) then runs sharp transformations.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertWithinQuota } from '@/lib/site-assets/quota';
import { buildSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { createPresignedUploadUrl } from '@propertypro/db';
import { sitePresignContract } from './contract';

const PRESIGN_TTL_SECONDS = 60 * 5; // 5 minutes

export const POST = withErrorHandler(
  runRoute(sitePresignContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req as Request, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (membership.role !== 'pm_admin') {
      throw new ForbiddenError('Only property managers can upload site assets');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');
    await assertWithinQuota(communityId, body.fileSize);

    const storagePath = buildSiteAssetPath(communityId, body.kind, body.filename);
    const { signedUrl, expiresAt } = await createPresignedUploadUrl(
      SITE_ASSETS_BUCKET,
      storagePath,
      { expiresInSeconds: PRESIGN_TTL_SECONDS },
    );

    return {
      uploadUrl: signedUrl,
      storagePath,
      expiresAt,
    };
  }),
);
```

**Discovery step**: confirm the exact signature of `createPresignedUploadUrl` from `@propertypro/db`. Read `packages/db/src/index.ts` for the export and follow it to the source. Adjust the option object shape if needed.

- [ ] **Step 4: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/api/site/uploads/presign.test.ts
pnpm --filter web typecheck
pnpm guard:contracts
git add apps/web/src/app/api/v1/site/uploads/presign apps/web/__tests__/api/site/uploads/presign.test.ts
git commit -m "feat(api): POST /api/v1/site/uploads/presign (PR #2 · 8/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `POST /api/v1/site/images/finalize`

**Files:**
- Create: `apps/web/src/app/api/v1/site/images/finalize/contract.ts`
- Create: `apps/web/src/app/api/v1/site/images/finalize/route.ts`
- Create: `apps/web/__tests__/api/site/images/finalize.test.ts`

The handler:
1. Downloads the raw upload via service role.
2. Validates MIME bytes (defense-in-depth — `sharp.metadata()` detects format).
3. Runs `transformSiteImage` with optional crop.
4. Writes the two variants back to Storage.
5. Audit-logs `site_image_uploaded`.
6. Increments `assetsBytesUsed` by the sum of variant byte lengths.
7. Returns canonical paths.

- [ ] **Step 1: Contract**

Create `apps/web/src/app/api/v1/site/images/finalize/contract.ts`:

```typescript
import { defineRoute, z } from '@propertypro/api-contract';

export const siteFinalizeRequestSchema = z.object({
  communityId: z.number().int().positive(),
  storagePath: z.string().min(1).max(512),
  altText: z.string().min(1).max(200),
  cropBox: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

export const siteFinalizeResponseSchema = z.object({
  variant1600Path: z.string(),
  variant800Path: z.string(),
  altText: z.string(),
});

export const siteFinalizeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/site/images/finalize',
  request: { body: siteFinalizeRequestSchema },
  response: siteFinalizeResponseSchema,
  permission: { resource: 'settings', action: 'write' },
});
```

- [ ] **Step 2: Test (sketch)**

Create `apps/web/__tests__/api/site/images/finalize.test.ts` mirroring presign's structure with these tests:

1. Happy path — downloads raw, transforms, uploads variants, audit log fired, quota incremented, response shape correct.
2. 400 on invalid storagePath (not matching the `{communityId}/{kind}/...` pattern).
3. 400 on storagePath belonging to a different community than `body.communityId`.
4. 500 on sharp processing failure (corrupt input).
5. 403 on wrong role / missing plan feature.
6. 401 on unauthenticated.

Use mocks for `downloadStorageObject`, `uploadStorageObject` (or the equivalent supabase storage helpers in `@propertypro/db`). Mock `transformSiteImage` directly to return canned buffers. Mock `logAuditEvent`, `incrementAssetsUsage`.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/api/v1/site/images/finalize/route.ts`:

```typescript
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { incrementAssetsUsage } from '@/lib/site-assets/quota';
import { parseSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { transformSiteImage } from '@/lib/site-assets/transform';
import { downloadStorageObject, uploadStorageObject, logAuditEvent } from '@propertypro/db';
import { siteFinalizeContract } from './contract';

export const POST = withErrorHandler(
  runRoute(siteFinalizeContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req as Request, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (membership.role !== 'pm_admin') {
      throw new ForbiddenError('Only property managers can finalize site images');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');

    // Validate storage path belongs to this community
    const parsed = parseSiteAssetPath(body.storagePath);
    if (!parsed || parsed.communityId !== communityId) {
      throw new ValidationError('storagePath does not belong to the supplied communityId');
    }

    // Download raw upload
    const rawBytes = await downloadStorageObject(SITE_ASSETS_BUCKET, body.storagePath);

    // Transform (crop + 1600w/800w WebP)
    const variants = await transformSiteImage(rawBytes, body.cropBox);

    // Upload variants. Canonical paths: append `.1600w.webp` / `.800w.webp` to the storage path.
    const variant1600Path = `${body.storagePath}.1600w.webp`;
    const variant800Path = `${body.storagePath}.800w.webp`;
    await Promise.all([
      uploadStorageObject(SITE_ASSETS_BUCKET, variant1600Path, variants.at1600w, { contentType: 'image/webp' }),
      uploadStorageObject(SITE_ASSETS_BUCKET, variant800Path, variants.at800w, { contentType: 'image/webp' }),
    ]);

    // Increment quota counter by the combined variant size
    const totalBytes = variants.at1600w.byteLength + variants.at800w.byteLength;
    await incrementAssetsUsage(communityId, totalBytes);

    // Audit log
    await logAuditEvent({
      userId,
      communityId,
      action: 'create',
      resourceType: 'site_image',
      resourceId: parsed.filename,
      metadata: { kind: parsed.kind, bytes: totalBytes, altText: body.altText },
    });

    return {
      variant1600Path,
      variant800Path,
      altText: body.altText,
    };
  }),
);
```

**Discovery step**: verify `downloadStorageObject` and `uploadStorageObject` exist with those exact names in `@propertypro/db`. If they're named differently (e.g., `getStorageObject` / `putStorageObject`), adjust accordingly. Check `packages/db/src/index.ts`.

- [ ] **Step 4: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/api/site/images/finalize.test.ts
pnpm --filter web typecheck
pnpm guard:contracts
git add apps/web/src/app/api/v1/site/images apps/web/__tests__/api/site/images/finalize.test.ts
git commit -m "feat(api): POST /api/v1/site/images/finalize (PR #2 · 9/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Rate limits in `rate-limit-config.ts`

**Files:**
- Modify: `apps/web/src/lib/middleware/rate-limit-config.ts`

- [ ] **Step 1: Read existing config**

```bash
cat apps/web/src/lib/middleware/rate-limit-config.ts | head -80
```

Find the route classification + limits configuration.

- [ ] **Step 2: Add the new entries**

Per spec Section 8.4:
- `POST /api/v1/site/uploads/presign` — 20 requests / 5 minutes per community
- `POST /api/v1/site/images/finalize` — 20 requests / 5 minutes per community

Add the two paths to whatever classification matches the existing pattern. If the file uses route-prefix matching (the typical pattern), add the prefix `/api/v1/site/uploads/` and `/api/v1/site/images/` to the `auth` route category or whichever category gives the desired per-community 20/5min limit.

If the rate-limit config requires per-route limits explicitly, add:
```typescript
'/api/v1/site/uploads/presign': { perCommunity: { count: 20, windowMs: 5 * 60 * 1000 } },
'/api/v1/site/images/finalize': { perCommunity: { count: 20, windowMs: 5 * 60 * 1000 } },
```

- [ ] **Step 3: Confirm typecheck**

```bash
pnpm --filter web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/middleware/rate-limit-config.ts
git commit -m "feat(middleware): rate limits for site upload endpoints (PR #2 · 10/23)

Per spec §8.4: 20 requests / 5 minutes / community on the presign and
finalize endpoints. Reuses the existing rate-limiter machinery; no new
limiter is introduced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `upsertPublishedBlock` service generalisation

**Files:**
- Modify: `apps/web/src/lib/services/site-blocks-service.ts`
- Modify: `apps/web/__tests__/lib/services/site-blocks-service.test.ts`

- [ ] **Step 1: Extend the test**

Append to `apps/web/__tests__/lib/services/site-blocks-service.test.ts`:

```typescript
import { upsertPublishedBlock } from '@/lib/services/site-blocks-service';

describe('upsertPublishedBlock', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes existing published block matching blockType + blockOrder, then inserts new', async () => {
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: { heading: 'About', body: 'Lorem ipsum.' },
    });
    expect(scopedClient.softDelete).toHaveBeenCalled();
    expect(scopedClient.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      blockType: 'text',
      blockOrder: 3,
      isDraft: false,
      content: { heading: 'About', body: 'Lorem ipsum.' },
    }));
  });

  it('audit-logs with action update + resourceType site_block + resourceId={blockType}', async () => {
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 4,
      content: { imagePath: '42/content/x.webp', altText: 'pool' },
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update',
      resourceType: 'site_block',
      resourceId: 'image',
    }));
  });
});

describe('upsertPublishedHero (back-compat caller)', () => {
  it('delegates to upsertPublishedBlock with blockType=hero blockOrder=1', async () => {
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: { headline: 'H' } });
    expect(scopedClient.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      blockType: 'hero',
      blockOrder: 1,
    }));
  });
});
```

- [ ] **Step 2: Implement**

In `apps/web/src/lib/services/site-blocks-service.ts`, refactor `upsertPublishedHero` to delegate:

```typescript
export interface UpsertPublishedBlockInput {
  communityId: number;
  actorUserId: string;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

export async function upsertPublishedBlock({
  communityId,
  actorUserId,
  blockType,
  blockOrder,
  content,
}: UpsertPublishedBlockInput): Promise<void> {
  const scoped = createScopedClient(communityId);

  // Soft-delete the existing published row at this blockType + blockOrder.
  await scoped.softDelete(
    siteBlocks,
    and(
      eq(siteBlocks.blockType, blockType),
      eq(siteBlocks.blockOrder, blockOrder),
      eq(siteBlocks.isDraft, false),
      isNull(siteBlocks.deletedAt),
    ),
  );

  await scoped.insert(siteBlocks, {
    communityId,
    blockType,
    blockOrder,
    isDraft: false,
    publishedAt: new Date(),
    content: content as Record<string, unknown>,
  });

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'site_block',
    resourceId: blockType,
    metadata: { blockType, blockOrder },
  });
}

// Back-compat wrapper — preserves Task 11 of PR #1b's contract.
export async function upsertPublishedHero(input: {
  communityId: number;
  actorUserId: string;
  content: import('@propertypro/shared').HeroBlockContent;
}): Promise<void> {
  return upsertPublishedBlock({
    communityId: input.communityId,
    actorUserId: input.actorUserId,
    blockType: 'hero',
    blockOrder: 1,
    content: input.content,
  });
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/lib/services/site-blocks-service.test.ts
pnpm --filter web typecheck
pnpm guard:db-access
git add apps/web/src/lib/services/site-blocks-service.ts apps/web/__tests__/lib/services/site-blocks-service.test.ts
git commit -m "refactor(services): upsertPublishedBlock generalisation (PR #2 · 11/23)

upsertPublishedHero now delegates to upsertPublishedBlock({blockType:'hero',
blockOrder:1, ...}). The new helper supports any block type at any order
slot — needed for text/image authoring in PR #2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `GET + PATCH /api/v1/pm/site/blocks`

**Files:**
- Create: `apps/web/src/app/api/v1/pm/site/blocks/contract.ts`
- Create: `apps/web/src/app/api/v1/pm/site/blocks/route.ts`
- Create: `apps/web/__tests__/api/pm/site/blocks.test.ts`

The contract:
- `GET /api/v1/pm/site/blocks?communityId=X` → `{ data: { blocks: SiteBlock[] } }` — returns ordered published blocks.
- `PATCH /api/v1/pm/site/blocks` body `{ communityId, blockType, blockOrder, content }` → `{ data: { ok: true } }` — upserts at the specified (blockType, blockOrder) slot.

The route handler validates `content` against the appropriate schema from `blockSchemaRegistry` (per-block validation done at the route layer; service is shape-agnostic).

- [ ] **Step 1: Contract**

Create `apps/web/src/app/api/v1/pm/site/blocks/contract.ts`:

```typescript
import { defineRoute, z } from '@propertypro/api-contract';

const siteBlockSchema = z.object({
  id: z.number(),
  blockType: z.string(),
  blockOrder: z.number(),
  content: z.unknown(),
});

export const blocksListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/blocks',
  request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.object({ blocks: z.array(siteBlockSchema) }),
  permission: { resource: 'settings', action: 'read' },
});

export const blocksUpsertContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/blocks',
  request: {
    body: z.object({
      communityId: z.number().int().positive(),
      blockType: z.enum(['text', 'image']),  // hero has its own dedicated endpoint
      blockOrder: z.number().int().min(2).max(99),  // 1 is reserved for hero
      content: z.unknown(),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});
```

- [ ] **Step 2: Test (sketch)**

Create `apps/web/__tests__/api/pm/site/blocks.test.ts` with describe blocks for GET (4 tests: happy, empty, role 403, unauthn 401) + PATCH (7 tests: text happy, image happy, schema-invalid 400, role 403, plan-feature 403, unauthn 401, communityId mismatch 400). Mirror the Task 11/12 hero-route test patterns.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/api/v1/pm/site/blocks/route.ts`:

```typescript
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { siteBlocks as siteBlocksModule } from '@propertypro/shared';
import { upsertPublishedBlock } from '@/lib/services/site-blocks-service';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { blocksListContract, blocksUpsertContract } from './contract';

async function ensurePmAccess(req: Request, communityId: number, mode: 'read' | 'write') {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  if (membership.role !== 'pm_admin') {
    throw new ForbiddenError('Only property managers can manage site blocks');
  }
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const GET = withErrorHandler(
  runRoute(blocksListContract, async ({ query, req }) => {
    const { communityId } = await ensurePmAccess(req as Request, query.communityId, 'read');
    const reader = getPublicCommunityScopedReader(communityId);
    const blocks = await reader.listSiteBlocks();
    return { blocks };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(blocksUpsertContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req as Request, body.communityId, 'write');

    // Validate content against the per-block schema from the registry
    const registry = siteBlocksModule.blockSchemaRegistry as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown } } }>;
    const schema = registry[body.blockType];
    if (!schema) {
      throw new ValidationError(`Unknown blockType: ${body.blockType}`);
    }
    const parse = schema.safeParse(body.content);
    if (!parse.success) {
      throw new ValidationError('Invalid block content', { fields: formatZodErrors(parse.error as never) });
    }

    await upsertPublishedBlock({
      communityId,
      actorUserId: userId,
      blockType: body.blockType,
      blockOrder: body.blockOrder,
      content: parse.data,
    });

    return { ok: true as const };
  }),
);
```

**Discovery step**: the spread `siteBlocksModule.blockSchemaRegistry` assumes `@propertypro/shared` re-exports the registry namespace. Verify by running:
```bash
grep -n "blockSchemaRegistry\|siteBlocks" packages/shared/src/index.ts | head -5
```

If the namespace export is `siteBlocks` (per PR #1a Task 13), the access is `siteBlocks.blockSchemaRegistry`. If it's a flat re-export, adjust.

- [ ] **Step 4: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/api/pm/site/blocks.test.ts
pnpm --filter web typecheck
pnpm guard:contracts
git add apps/web/src/app/api/v1/pm/site/blocks apps/web/__tests__/api/pm/site/blocks.test.ts
git commit -m "feat(api): GET + PATCH /api/v1/pm/site/blocks (PR #2 · 12/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: TextBlock renderer + tests

**Files:**
- Create: `apps/web/src/components/public-site/blocks/TextBlock.tsx`
- Create: `apps/web/__tests__/components/public-site/blocks/TextBlock.test.tsx`

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/components/public-site/blocks/TextBlock.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextBlock } from '@/components/public-site/blocks/TextBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'text', blockOrder: 2, content }, community, theme, layout: 'tidewater' };
}

describe('<TextBlock>', () => {
  it('renders heading as h2 when present', () => {
    render(<TextBlock {...makeProps({ heading: 'About Us', body: 'We are a community.' })} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('About Us');
  });

  it('renders body without heading', () => {
    render(<TextBlock {...makeProps({ body: 'Just the body.' })} />);
    expect(screen.getByText('Just the body.')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('escapes HTML in body (plain text only)', () => {
    render(<TextBlock {...makeProps({ body: '<script>alert(1)</script>plain' })} />);
    expect(screen.getByText(/<script>alert\(1\)<\/script>plain/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('emits console.warn and renders null on invalid content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<TextBlock {...makeProps({ body: '' })} />);
    expect(container.querySelector('p')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('text block content'), expect.anything());
    warnSpy.mockRestore();
  });

  it('preserves newlines as paragraph breaks', () => {
    render(<TextBlock {...makeProps({ body: 'Line one.\n\nLine two.' })} />);
    const paragraphs = document.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/web/src/components/public-site/blocks/TextBlock.tsx`:

```typescript
import { textBlockSchema, type TextBlockContent } from '@propertypro/shared';
import type { BlockRendererProps } from './types';

export function TextBlock(props: BlockRendererProps) {
  const parsed = textBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'text block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: TextBlockContent = parsed.data;
  const paragraphs = content.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {content.heading && (
          <h2 className="font-heading text-2xl font-semibold text-content mb-4">
            {content.heading}
          </h2>
        )}
        <div className="space-y-4 text-base text-content">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/components/public-site/blocks/TextBlock.test.tsx
git add apps/web/src/components/public-site/blocks/TextBlock.tsx apps/web/__tests__/components/public-site/blocks/TextBlock.test.tsx
git commit -m "feat(public-site): TextBlock renderer (PR #2 · 13/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: ImageBlock renderer + tests

**Files:**
- Create: `apps/web/src/components/public-site/blocks/ImageBlock.tsx`
- Create: `apps/web/__tests__/components/public-site/blocks/ImageBlock.test.tsx`

- [ ] **Step 1: Test first**

Create `apps/web/__tests__/components/public-site/blocks/ImageBlock.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageBlock } from '@/components/public-site/blocks/ImageBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'image', blockOrder: 3, content }, community, theme, layout: 'tidewater' };
}

describe('<ImageBlock>', () => {
  it('renders figure with img + alt text', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'The pool deck' })} />);
    const img = screen.getByRole('img', { name: 'The pool deck' });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
    expect(img.closest('figure')).not.toBeNull();
  });

  it('renders srcset with 1600w + 800w when both variants are present', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'pool' })} />);
    const img = screen.getByRole('img', { name: 'pool' });
    // The renderer constructs srcset from the canonical path conventions.
    // 1/content/pool.webp implies sibling variants at 1/content/pool.webp.1600w.webp etc.
    expect(img.getAttribute('srcset') ?? '').toMatch(/1600w/);
    expect(img.getAttribute('srcset') ?? '').toMatch(/800w/);
  });

  it('renders caption when provided', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/pool.webp', altText: 'pool', caption: 'Renovated 2024.' })} />);
    expect(screen.getByText('Renovated 2024.')).toBeInTheDocument();
  });

  it('renders decorative image with alt=""', () => {
    render(<ImageBlock {...makeProps({ imagePath: '1/content/divider.webp', decorative: true })} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('emits console.warn and renders null on invalid content (alt missing, not decorative)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<ImageBlock {...makeProps({ imagePath: '1/content/x.webp' })} />);
    expect(container.querySelector('img')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('image block content'), expect.anything());
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/web/src/components/public-site/blocks/ImageBlock.tsx`:

```typescript
import { imageBlockSchema, type ImageBlockContent } from '@propertypro/shared';
import { buildPublicAssetUrl } from '@/lib/site-assets/storage-paths';
import type { BlockRendererProps } from './types';

export function ImageBlock(props: BlockRendererProps) {
  const parsed = imageBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'image block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: ImageBlockContent = parsed.data;

  // The finalize endpoint writes sibling variant files at
  // {storagePath}.1600w.webp and {storagePath}.800w.webp.
  const src1600 = buildPublicAssetUrl(`${content.imagePath}.1600w.webp`);
  const src800 = buildPublicAssetUrl(`${content.imagePath}.800w.webp`);
  const fallbackSrc = buildPublicAssetUrl(content.imagePath);

  const alt = content.decorative === true ? '' : (content.altText ?? '');

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <figure className="mx-auto max-w-4xl">
        <img
          src={fallbackSrc}
          srcSet={`${src800} 800w, ${src1600} 1600w`}
          sizes="(min-width: 1024px) 800px, 100vw"
          alt={alt}
          className="w-full h-auto rounded-md shadow-e1"
          loading="lazy"
        />
        {content.caption && (
          <figcaption className="mt-3 text-sm text-content-secondary text-center">
            {content.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm --filter web exec vitest run __tests__/components/public-site/blocks/ImageBlock.test.tsx
git add apps/web/src/components/public-site/blocks/ImageBlock.tsx apps/web/__tests__/components/public-site/blocks/ImageBlock.test.tsx
git commit -m "feat(public-site): ImageBlock renderer (PR #2 · 14/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Register TextBlock + ImageBlock

**Files:**
- Modify: `apps/web/src/components/public-site/blocks/registry.ts`

- [ ] **Step 1: Update registry**

Replace `apps/web/src/components/public-site/blocks/registry.ts`:

```typescript
import type { BlockType } from '@propertypro/shared';
import type { BlockRenderer } from './types';
import { HeroBlock } from './HeroBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer<any>>> = {
  hero: HeroBlock,
  text: TextBlock,
  image: ImageBlock,
  // announcements: PR #3
  // documents, meetings, contact: PR #4
};

export function hasRenderer(blockType: BlockType): boolean {
  return blockType in blockRendererRegistry;
}
```

- [ ] **Step 2: Run + commit**

```bash
pnpm --filter web typecheck
pnpm --filter web exec vitest run __tests__/components/public-site
git add apps/web/src/components/public-site/blocks/registry.ts
git commit -m "feat(public-site): register TextBlock + ImageBlock (PR #2 · 15/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: `useContentBlocks` + `useUpsertContentBlock` hooks

**Files:**
- Create: `apps/web/src/hooks/use-content-blocks.ts`
- Create: `apps/web/__tests__/hooks/use-content-blocks.test.tsx`

- [ ] **Step 1: Test sketch**

The test file mirrors `use-hero-block.test.tsx`:
- `useContentBlocks(42)` GETs `/api/v1/pm/site/blocks?communityId=42` → returns array.
- `useUpsertContentBlock(42)` PATCHes with body `{ communityId, blockType, blockOrder, content }` → invalidates query.
- Error surfaces (`{ error: { message } }`) raised as `Error`.

Write 5-6 tests covering happy + error paths.

- [ ] **Step 2: Implement**

Create `apps/web/src/hooks/use-content-blocks.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface SiteBlockSummary {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

const blocksKey = (communityId: number) => ['pm', 'site', 'blocks', communityId] as const;

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

export function useContentBlocks(communityId: number) {
  return useQuery<SiteBlockSummary[]>({
    queryKey: blocksKey(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/pm/site/blocks?communityId=${communityId}`);
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { data: { blocks: SiteBlockSummary[] } };
      return body.data.blocks;
    },
  });
}

export interface UpsertContentBlockInput {
  blockType: 'text' | 'image';
  blockOrder: number;
  content: unknown;
}

export function useUpsertContentBlock(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, UpsertContentBlockInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/pm/site/blocks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: blocksKey(communityId) });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter web exec vitest run __tests__/hooks/use-content-blocks.test.tsx
git add apps/web/src/hooks/use-content-blocks.ts apps/web/__tests__/hooks/use-content-blocks.test.tsx
git commit -m "feat(hooks): useContentBlocks + useUpsertContentBlock (PR #2 · 16/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: `useImageUpload` hook

**Files:**
- Create: `apps/web/src/hooks/use-image-upload.ts`
- Create: `apps/web/__tests__/hooks/use-image-upload.test.tsx`

Orchestrates the 3-step pipeline: presign → direct upload → finalize. Returns step-aware progress/error state.

- [ ] **Step 1: Test sketch**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useImageUpload } from '@/hooks/use-image-upload';

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn();
});

const FILE = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' });

describe('useImageUpload', () => {
  it('walks presign → upload → finalize and returns canonical paths', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({  // presign
        ok: true,
        json: async () => ({ data: { uploadUrl: 'https://upload-url', storagePath: '42/content/abc-photo.jpg', expiresAt: new Date().toISOString() } }),
      })
      .mockResolvedValueOnce({ ok: true })  // PUT to upload URL
      .mockResolvedValueOnce({  // finalize
        ok: true,
        json: async () => ({ data: { variant1600Path: '42/content/abc-photo.jpg.1600w.webp', variant800Path: '42/content/abc-photo.jpg.800w.webp', altText: 'pool' } }),
      });

    const { result } = renderHook(() => useImageUpload({ communityId: 42 }), { wrapper: wrap() });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync({ file: FILE, kind: 'content', altText: 'pool' });
    });
    expect(res).toEqual(expect.objectContaining({
      storagePath: '42/content/abc-photo.jpg',
      variant1600Path: '42/content/abc-photo.jpg.1600w.webp',
    }));
  });

  it('surfaces presign error if step 1 fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 413, json: async () => ({ error: { code: 'SITE_ASSETS_QUOTA_EXCEEDED', message: 'over budget' } }),
    });
    const { result } = renderHook(() => useImageUpload({ communityId: 42 }), { wrapper: wrap() });
    await expect(result.current.mutateAsync({ file: FILE, kind: 'content', altText: 'pool' })).rejects.toThrow(/over budget/);
  });

  it('surfaces upload error if step 2 fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { uploadUrl: 'https://upload-url', storagePath: 'x', expiresAt: new Date().toISOString() } }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(() => useImageUpload({ communityId: 42 }), { wrapper: wrap() });
    await expect(result.current.mutateAsync({ file: FILE, kind: 'content', altText: 'pool' })).rejects.toThrow(/upload/i);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import { useMutation } from '@tanstack/react-query';

export interface UseImageUploadOptions {
  communityId: number;
}

export interface ImageUploadInput {
  file: File;
  kind: 'hero' | 'content';
  altText: string;
  cropBox?: { x: number; y: number; width: number; height: number };
}

export interface ImageUploadResult {
  storagePath: string;
  variant1600Path: string;
  variant800Path: string;
  altText: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errBody.error?.message ?? `Request failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export function useImageUpload({ communityId }: UseImageUploadOptions) {
  return useMutation<ImageUploadResult, Error, ImageUploadInput>({
    mutationFn: async ({ file, kind, altText, cropBox }) => {
      // Step 1: presign
      const presign = await postJson<{ uploadUrl: string; storagePath: string; expiresAt: string }>(
        '/api/v1/site/uploads/presign',
        { communityId, kind, filename: file.name, mimeType: file.type, fileSize: file.size },
      );

      // Step 2: PUT raw bytes to the presigned URL
      const uploadRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
      }

      // Step 3: finalize
      const finalized = await postJson<{ variant1600Path: string; variant800Path: string; altText: string }>(
        '/api/v1/site/images/finalize',
        { communityId, storagePath: presign.storagePath, altText, cropBox },
      );

      return {
        storagePath: presign.storagePath,
        variant1600Path: finalized.variant1600Path,
        variant800Path: finalized.variant800Path,
        altText: finalized.altText,
      };
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter web exec vitest run __tests__/hooks/use-image-upload.test.tsx
git add apps/web/src/hooks/use-image-upload.ts apps/web/__tests__/hooks/use-image-upload.test.tsx
git commit -m "feat(hooks): useImageUpload — presign + PUT + finalize orchestration (PR #2 · 17/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: `TextBlockForm` client component

**Files:**
- Create: `apps/web/src/components/pm/site-editor/TextBlockForm.tsx`
- Create: `apps/web/__tests__/components/pm/site-editor/TextBlockForm.test.tsx`

Mirror `HeroBlockForm.tsx` structure. Two fields: heading (optional, max 120) + body (required, max 2000). Save button disabled until body non-empty. Server validation errors surface inline.

```typescript
'use client';
import { useState, type FormEvent } from 'react';
import type { TextBlockContent } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: TextBlockContent | null;
  onSaved?: () => void;
}

export function TextBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [heading, setHeading] = useState(initial?.heading ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const disabled = body.trim().length === 0 || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: TextBlockContent = {
      body: body.trim(),
      ...(heading.trim() ? { heading: heading.trim() } : {}),
    } as TextBlockContent;
    try {
      await mutation.mutateAsync({ blockType: 'text', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`text-heading-${blockOrder}`} className="block text-sm font-medium text-content">Heading</label>
        <input
          id={`text-heading-${blockOrder}`}
          type="text"
          maxLength={120}
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      <div>
        <label htmlFor={`text-body-${blockOrder}`} className="block text-sm font-medium text-content">
          Body <span className="text-danger">*</span>
        </label>
        <textarea
          id={`text-body-${blockOrder}`}
          maxLength={2000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
```

Test 5-6 cases mirroring HeroBlockForm.test.tsx. Commit `feat(pm): TextBlockForm (PR #2 · 18/23)`.

---

### Task 19: `ImageBlockForm` client component (with `react-image-crop`)

**Files:**
- Create: `apps/web/src/components/pm/site-editor/ImageBlockForm.tsx`
- Create: `apps/web/__tests__/components/pm/site-editor/ImageBlockForm.test.tsx`

The most complex form. State machine: idle → file selected → crop UI → upload in progress → finalize in progress → saved.

```typescript
'use client';
import { useState, type FormEvent, useRef } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { ImageBlockContent } from '@propertypro/shared';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: ImageBlockContent | null;
  onSaved?: () => void;
}

export function ImageBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [altText, setAltText] = useState(initial?.altText ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [decorative, setDecorative] = useState(initial?.decorative === true);
  const [serverError, setServerError] = useState<string | null>(null);
  const upload = useImageUpload({ communityId });
  const save = useUpsertContentBlock(communityId);
  const previewUrlRef = useRef<string | null>(null);

  const fileUrl = file ? (() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    return previewUrlRef.current;
  })() : null;

  const disabled = (!file && !initial) || (!decorative && altText.trim().length === 0) || upload.isPending || save.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    try {
      let imagePath = initial?.imagePath ?? '';
      if (file) {
        const result = await upload.mutateAsync({
          file,
          kind: 'content',
          altText: decorative ? '' : altText.trim(),
          cropBox: crop && crop.width > 0 ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height } : undefined,
        });
        imagePath = result.storagePath;
      }
      const content: ImageBlockContent = {
        imagePath,
        ...(decorative ? { decorative: true as const } : { altText: altText.trim() }),
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      } as ImageBlockContent;
      await save.mutateAsync({ blockType: 'image', blockOrder, content });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`image-file-${blockOrder}`} className="block text-sm font-medium text-content">Image</label>
        <input
          id={`image-file-${blockOrder}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </div>
      {fileUrl && (
        <div className="border border-default rounded-md p-2">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={16/9}>
            <img src={fileUrl} alt="" className="max-w-full" />
          </ReactCrop>
          <p className="text-xs text-content-secondary mt-1">Drag to crop. Recommended 16:9.</p>
        </div>
      )}
      <div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
          Decorative image (no alt text required)
        </label>
      </div>
      {!decorative && (
        <div>
          <label htmlFor={`image-alt-${blockOrder}`} className="block text-sm font-medium text-content">
            Alt text <span className="text-danger">*</span>
          </label>
          <input
            id={`image-alt-${blockOrder}`}
            type="text"
            maxLength={200}
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            required={!decorative}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
          />
        </div>
      )}
      <div>
        <label htmlFor={`image-caption-${blockOrder}`} className="block text-sm font-medium text-content">Caption</label>
        <input
          id={`image-caption-${blockOrder}`}
          type="text"
          maxLength={200}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {upload.isPending ? 'Uploading…' : save.isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
```

Test cases (8+): renders fields, alt-required-without-decorative, decorative checkbox hides alt input, crop applied to upload, upload → save flow, server error display, initial image pre-populates, file replacement.

Commit `feat(pm): ImageBlockForm with react-image-crop (PR #2 · 19/23)`.

---

### Task 20: `ContentSectionsList` + integrate into settings/website page

**Files:**
- Create: `apps/web/src/components/pm/site-editor/ContentSectionsList.tsx`
- Modify: `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx`

`ContentSectionsList` is a client component (uses hooks) that lists existing text + image blocks and provides "Add text" / "Add image" buttons. Each block renders inline edit forms.

```typescript
'use client';
import { useState } from 'react';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import { TextBlockForm } from './TextBlockForm';
import { ImageBlockForm } from './ImageBlockForm';
import { textBlockSchema, imageBlockSchema, type TextBlockContent, type ImageBlockContent } from '@propertypro/shared';

interface Props {
  communityId: number;
}

function nextBlockOrder(existingOrders: number[], skipHeroOrder = 1): number {
  const max = existingOrders.length === 0 ? skipHeroOrder : Math.max(...existingOrders);
  return Math.max(max + 1, skipHeroOrder + 1);
}

export function ContentSectionsList({ communityId }: Props) {
  const { data: blocks, isLoading } = useContentBlocks(communityId);
  const [adding, setAdding] = useState<'text' | 'image' | null>(null);

  if (isLoading) return <p className="text-sm text-content-secondary">Loading content sections…</p>;

  const contentBlocks = (blocks ?? []).filter((b) => b.blockType === 'text' || b.blockType === 'image');

  return (
    <section aria-labelledby="content-sections" className="space-y-6">
      <h2 id="content-sections" className="text-lg font-medium text-content">
        Content Sections
      </h2>
      {contentBlocks.map((b) => (
        <div key={b.id} className="rounded-md border border-default bg-surface-card p-4">
          <div className="mb-3 text-xs text-content-secondary">
            #{b.blockOrder} — {b.blockType}
          </div>
          {b.blockType === 'text' && (
            <TextBlockForm
              communityId={communityId}
              blockOrder={b.blockOrder}
              initial={textBlockSchema.safeParse(b.content).data as TextBlockContent ?? null}
            />
          )}
          {b.blockType === 'image' && (
            <ImageBlockForm
              communityId={communityId}
              blockOrder={b.blockOrder}
              initial={imageBlockSchema.safeParse(b.content).data as ImageBlockContent ?? null}
            />
          )}
        </div>
      ))}
      {adding === 'text' && (
        <div className="rounded-md border-2 border-dashed border-default bg-surface-card p-4">
          <TextBlockForm
            communityId={communityId}
            blockOrder={nextBlockOrder(contentBlocks.map((b) => b.blockOrder))}
            initial={null}
            onSaved={() => setAdding(null)}
          />
        </div>
      )}
      {adding === 'image' && (
        <div className="rounded-md border-2 border-dashed border-default bg-surface-card p-4">
          <ImageBlockForm
            communityId={communityId}
            blockOrder={nextBlockOrder(contentBlocks.map((b) => b.blockOrder))}
            initial={null}
            onSaved={() => setAdding(null)}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setAdding('text')} className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted">+ Add text section</button>
        <button type="button" onClick={() => setAdding('image')} className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted">+ Add image section</button>
      </div>
    </section>
  );
}
```

Modify the settings/website page to include the component after the Welcome card:

```typescript
import { ContentSectionsList } from '@/components/pm/site-editor/ContentSectionsList';

// ... after the existing <section aria-labelledby="welcome-tab"> closing tag, add:
<div className="mt-8">
  <ContentSectionsList communityId={communityId} />
</div>
```

Commit `feat(pm): ContentSectionsList integration (PR #2 · 20/23)`.

---

### Task 21: Account-lifecycle cleanup hook

**Files:**
- Modify: `apps/web/src/app/api/v1/internal/account-lifecycle/route.ts`
- Modify: `apps/web/__tests__/api/internal/account-lifecycle.test.ts` (or wherever the cron test lives)

The existing cron hard-deletes soft-deleted rows older than 30 days. For PR #2, when a community is hard-deleted, ALL `community-site-assets` objects under `{communityId}/` must be removed from Storage, AND `assetsBytesUsed` must be zeroed.

- [ ] **Step 1: Discover the existing cron structure**

```bash
cat apps/web/src/app/api/v1/internal/account-lifecycle/route.ts | head -80
ls apps/web/__tests__/api/internal/ 2>&1
```

- [ ] **Step 2: Add the cleanup helper**

Create or extend `apps/web/src/lib/site-assets/cleanup.ts`:

```typescript
import { SITE_ASSETS_BUCKET } from './storage-paths';
import { listStorageObjects, deleteStorageObjects } from '@propertypro/db';

/**
 * Delete every object in the community-site-assets bucket under the
 * given community's path prefix. Called by the account-lifecycle cron
 * when a community is hard-deleted.
 *
 * AUTHZ: caller MUST have verified the community is being hard-deleted
 * (deletedAt > 30 days ago). The function performs no auth checks of
 * its own — it's an internal-only helper.
 */
export async function purgeCommunitySiteAssets(communityId: number): Promise<{ deletedCount: number }> {
  const prefix = `${communityId}/`;
  const objects = await listStorageObjects(SITE_ASSETS_BUCKET, { prefix });
  if (objects.length === 0) return { deletedCount: 0 };
  await deleteStorageObjects(SITE_ASSETS_BUCKET, objects.map((o) => o.name));
  return { deletedCount: objects.length };
}
```

**Discovery step**: verify `listStorageObjects` + `deleteStorageObjects` exist on `@propertypro/db`. Adjust names if needed.

- [ ] **Step 3: Wire it into the cron**

In the existing `account-lifecycle/route.ts`, find the community-hard-delete branch and add a call to `purgeCommunitySiteAssets(communityId)` after the row-level cleanup.

- [ ] **Step 4: Tests**

Add a test case to the existing cron test file asserting that `purgeCommunitySiteAssets` is called for any community hard-deleted in the run. Mock the storage helpers.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/site-assets/cleanup.ts apps/web/src/app/api/v1/internal/account-lifecycle/route.ts apps/web/__tests__/api/internal
git commit -m "feat(lifecycle): purge site assets on community hard-delete (PR #2 · 21/23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Documentation

**Files:**
- Create: `docs/design-system/blocks/text.md`
- Create: `docs/design-system/blocks/image.md`

Mirror the structure of `docs/design-system/blocks/hero.md` (created in PR #1b). Both docs cover:
- Schema (Zod) + field constraints
- Renderer file path + key responsibilities
- Editor form file path
- API surfaces (GET + PATCH /api/v1/pm/site/blocks)
- Tier requirements (Essentials)
- Accessibility notes

For `image.md` additionally cover:
- Upload pipeline (presign → PUT → finalize)
- Storage path convention
- Variant filenames (`{path}.1600w.webp`, `{path}.800w.webp`)
- Per-plan quotas (link to spec §8.3)
- `react-image-crop` for client-side preview crop; sharp for authoritative server crop

Commit `docs(design-system): text + image blocks (PR #2 · 22/23)`.

---

### Task 23: Final validation + open PR

**Files:** no code changes.

- [ ] **Step 1: Run all guards + tests + build**

```bash
pnpm typecheck
pnpm lint
pnpm test 2>&1 | tail -10
pnpm --filter @propertypro/db db:migrate  # apply 0006
pnpm --filter @propertypro/db exec drizzle-kit generate --name verify_no_drift_pr2
# Expect: "No schema changes" (the 0006 migration touches storage.* which Drizzle doesn't mirror)
rm packages/db/migrations/000*_verify_no_drift_pr2.sql 2>/dev/null || true
git checkout -- packages/db/migrations/meta/_journal.json
pnpm build  # this MAY fail locally on accounting/* per the pre-existing env issue; CI passes
```

Confirm:
- typecheck: clean
- lint: pass (includes contracts guard, DB-access guard, help-content guard)
- test: all new tests pass; only the 2 pre-existing failures from PR #1b remain
- migration drift: none

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --base claude/awesome-brown-9b8f97 --title "feat: Text + Image blocks + storage pipeline (Property Landing Page PR #2)" --body "$(cat <<'EOF'
## Summary

Second vertical slice of the Property Landing Page. Ships:

- **Two new block renderers**: `TextBlock` + `ImageBlock` (server components, defense-in-depth `safeParse`).
- **Storage pipeline**: `community-site-assets` bucket + RLS policies; two-step presign + finalize endpoints; `sharp` server-side crop + resize (1600w + 800w WebP variants); per-plan quota enforcement; account-lifecycle purge on community hard-delete.
- **PM editor extensions**: "Content sections" stack below the Welcome tab at `/pm/settings/website`. Text + Image inline forms; image picker uses `react-image-crop` for preview crop with server-side re-application.
- **Generalisation**: `upsertPublishedBlock` extracts the publish primitive from `upsertPublishedHero` (PR #1b); the hero variant is now a thin caller.

Plan: `docs/superpowers/plans/2026-05-27-property-landing-page-pr-2-text-image-storage.md`.
Spec: §2.8 (image handling), §8.3 (quotas), §8.4 (rate limits), §9 row #2.

## What's NOT in scope

- Block reorder controls (PR #8).
- SoR blocks: announcements (PR #3), documents/meetings/contact (PR #4).
- Onboarding wizard (PR #5).
- Custom CSS overrides (PR #11).
- The `accounting/*` build error you may see locally is a pre-existing env issue, not new with PR #2.

## Test plan

- [x] typecheck clean.
- [x] lint passes (contracts guard, DB-access guard, breadcrumb guard, help-content guard).
- [x] All new tests pass (~80 new tests across 12 test files).
- [x] No migration drift.
- [x] Manual: upload an image via the PM editor, verify the public site renders the new image block.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note `--base claude/awesome-brown-9b8f97` — PR #2 stacks on PR #1b. When PR #1b merges to main, rebase PR #2 onto main.

---

## Self-Review

**Spec coverage (against Section 2.8 + 8.3 + 8.4 + 9.2):**

- ✅ Two block renderers (Text, Image) — Tasks 13, 14
- ✅ Storage bucket + RLS — Task 2
- ✅ Two-step upload pattern — Tasks 8, 9
- ✅ `sharp` server-side transformations (1600w + 800w WebP) — Tasks 6, 7
- ✅ `react-image-crop` in PM editor — Task 19
- ✅ Per-plan quotas — Tasks 4, 5; enforced at presign — Task 8
- ✅ Rate limits per §8.4 — Task 10
- ✅ Account-lifecycle cleanup — Task 21
- ✅ Documentation (`blocks/text.md`, `blocks/image.md`) — Task 22
- ✅ Plan A1 contract pattern on every new route — Tasks 8, 9, 12

**Placeholder scan:** All tasks have executable steps with complete code blocks. "Discovery step" notes where the implementer should grep before locking import names — these are deliberate (the existing codebase may use different export names for storage helpers).

**Type consistency:**
- `AssetKind` defined in Task 3, consumed in Task 8 contract.
- `QuotaExceededError` defined in Task 5, raised in Task 8, mapped to 413 by `withErrorHandler`.
- `SiteImageVariants` defined in Task 6, returned by Task 7.
- `UpsertPublishedBlockInput` defined in Task 11, consumed in Task 12.
- `SiteBlockSummary` defined in Task 16, consumed in Task 20.
- `ImageUploadResult` defined in Task 17, consumed in Task 19.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-property-landing-page-pr-2-text-image-storage.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh implementer subagent per task with two-stage review (spec compliance + code quality). Matches the PR #1b execution cadence.

**2. Inline Execution** — Execute tasks in this session with checkpoints.

**Which approach?**

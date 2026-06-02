# Starter Packs CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform-admin Starter Packs management surface (§5.3) — list/create/version/edit/archive of `site_starter_packs`, a structured block editor, and a data-driven web apply path so versioning takes effect end-to-end.

**Architecture:** Four sequential PRs. (A) shared block-array validator in `@propertypro/shared`; (B) make `applyStarterPackToCommunity` select the latest non-archived pack per `community_type`; (C) admin CRUD routes mirroring the theme-presets routes (`createAdminTypedClient` + `requirePlatformAdmin` + plain Zod/`NextResponse`); (D) admin UI (table + block editor + page + nav). No DB migration — `site_starter_packs` exists since migration 0004.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zod, Supabase typed admin client (`@propertypro/db/supabase/admin`), Drizzle (web apply path), Vitest. `apps/admin` has NO react-query/RTL — client components use plain `fetch` + `useState`; component tests use `createRoot`/`act`.

**Spec:** `docs/superpowers/specs/2026-06-02-starter-packs-crud-design.md`

**Workflow per PR:** branch off `origin/main` (`git checkout --detach && git fetch origin main --quiet && git checkout -b claude/<slug> origin/main`); TDD; verify with `pnpm exec vitest run <paths>` from repo root, `pnpm exec tsx scripts/verify-scoped-db-access.ts`, cache-free typecheck (`pnpm --filter @propertypro/<pkg> exec tsc --noEmit`); commit with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer; push; `gh pr create --base main`; poll CI to full-green; squash-merge; then next PR off updated main.

**Known local-only test behaviors (do not chase — trust CI):** admin/web route tests that import `@propertypro/api-contract` fail locally with "Failed to resolve entry" (not applicable here — these admin routes don't use it); DB-gated tests fail locally with "Missing DATABASE_URL".

---

## File Structure

**PR-A — shared validation**
- Create: `packages/shared/src/site-blocks/starter-pack.ts` — `starterPackBlockSchema`, `starterPackBlocksSchema`, `validateStarterPackBlocks`.
- Modify: `packages/shared/src/site-blocks/index.ts` — export the new module's symbols.
- Modify: `packages/shared/src/index.ts` — re-export the new symbols from the top barrel.
- Test: `packages/shared/__tests__/starter-pack.test.ts`.

**PR-B — apply path**
- Modify: `apps/web/src/lib/services/starter-pack-service.ts` — replace hardcoded slug lookup with latest-non-archived-per-type query.
- Test: `apps/web/__tests__/lib/services/starter-pack-service.test.ts`.

**PR-C — admin routes**
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/_shared.ts` — row type, column list, `shapePack`, `communityTypeSchema`, validation→response bridge.
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/route.ts` — `GET` + `POST`.
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/route.ts` — `PATCH` + `DELETE`.
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/new-version/route.ts` — `POST`.
- Test: `apps/admin/__tests__/site-templates/starter-packs-route.test.ts` (GET+POST), `starter-packs-slug-route.test.ts` (PATCH+DELETE), `starter-packs-new-version-route.test.ts` (POST).

**PR-D — admin UI**
- Create: `apps/admin/src/app/site-templates/starter-packs/page.tsx`.
- Create: `apps/admin/src/components/site-templates/StarterPacksTable.tsx`.
- Create: `apps/admin/src/components/site-templates/StarterPackBlocksEditor.tsx`.
- Modify: `apps/admin/src/app/site-templates/page.tsx` — add a "Starter Packs →" nav link.
- Test: `apps/admin/__tests__/site-templates/starter-packs-table.test.tsx`.

---

## PR-A — Shared block-array validation

Branch: `claude/starter-packs-shared-validation`. (This branch already carries the spec commits `4afd3f0d` + `cfa43062` — branch off `claude/starter-packs-crud-spec` instead of main so the spec lands with PR-A: `git checkout claude/starter-packs-crud-spec`.)

### Task A1: Validation module + tests

**Files:**
- Create: `packages/shared/src/site-blocks/starter-pack.ts`
- Test: `packages/shared/__tests__/starter-pack.test.ts`
- Modify: `packages/shared/src/site-blocks/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/starter-pack.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateStarterPackBlocks } from '../src/site-blocks/starter-pack';

const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };

describe('validateStarterPackBlocks', () => {
  it('accepts a valid hero + SoR pack', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'hero', blockOrder: 1, content: HERO },
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5, timeWindowDays: 30 } },
      { blockType: 'contact', blockOrder: 3, content: { showBoard: true, showManagement: true } },
    ]);
    expect(res.ok).toBe(true);
  });

  it('rejects an empty array', () => {
    const res = validateStarterPackBlocks([]);
    expect(res.ok).toBe(false);
  });

  it('rejects an unknown blockType', () => {
    const res = validateStarterPackBlocks([{ blockType: 'banner', blockOrder: 2, content: {} }]);
    expect(res.ok).toBe(false);
  });

  it('rejects invalid block content (announcements limit must be positive)', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'announcements', blockOrder: 2, content: { limit: -1 } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fields.some((f) => f.field.startsWith('0.content'))).toBe(true);
  });

  it('rejects duplicate blockOrder', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5 } },
      { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fields.some((f) => /blockOrder/.test(f.message))).toBe(true);
  });

  it('rejects more than one hero block', () => {
    const res = validateStarterPackBlocks([
      { blockType: 'hero', blockOrder: 1, content: HERO },
      { blockType: 'hero', blockOrder: 2, content: HERO },
    ]);
    expect(res.ok).toBe(false);
  });

  it('rejects a hero not at blockOrder 1', () => {
    const res = validateStarterPackBlocks([{ blockType: 'hero', blockOrder: 2, content: HERO }]);
    expect(res.ok).toBe(false);
  });

  it('rejects a non-hero block at blockOrder 1', () => {
    const res = validateStarterPackBlocks([{ blockType: 'contact', blockOrder: 1, content: { showBoard: true, showManagement: true } }]);
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/starter-pack.test.ts`
Expected: FAIL — cannot resolve `../src/site-blocks/starter-pack`.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/site-blocks/starter-pack.ts`:

```ts
/**
 * Starter-pack block-array validation. A starter pack's `blocks` jsonb is an
 * array of { blockType, blockOrder, content }. This module validates both the
 * array structure (orders, hero placement) and each block's content against
 * the matching block schema, returning a flat field-error list the admin
 * routes can echo in their { error: { message, fields } } envelope.
 *
 * NOTE: blockSchemaRegistry is imported from the sibling barrel and used only
 * inside validateStarterPackBlocks (call time), so the index ↔ starter-pack
 * import cycle resolves via ES-module live bindings — never reference it at
 * module-eval time here.
 */
import { z } from 'zod';
import { blockTypeSchema, type BlockType } from './types';
import { blockSchemaRegistry } from './index';

export const starterPackBlockSchema = z
  .object({
    blockType: blockTypeSchema,
    blockOrder: z.number().int().min(1),
    content: z.unknown(),
  })
  .strict();

export const starterPackBlocksSchema = z
  .array(starterPackBlockSchema)
  .min(1)
  .superRefine((blocks, ctx) => {
    const seen = new Set<number>();
    blocks.forEach((b, i) => {
      if (seen.has(b.blockOrder)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: `Duplicate blockOrder ${b.blockOrder}` });
      }
      seen.add(b.blockOrder);
      if (b.blockType === 'hero' && b.blockOrder !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: 'The hero block must be at blockOrder 1' });
      }
      if (b.blockType !== 'hero' && b.blockOrder < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'blockOrder'], message: 'Non-hero blocks must be at blockOrder 2 or higher' });
      }
    });
    if (blocks.filter((b) => b.blockType === 'hero').length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'At most one hero block is allowed' });
    }
  });

export interface StarterPackBlock {
  blockType: BlockType;
  blockOrder: number;
  content: unknown;
}

export interface StarterPackFieldError {
  field: string;
  message: string;
}

export type ValidateStarterPackBlocksResult =
  | { ok: true; data: StarterPackBlock[] }
  | { ok: false; fields: StarterPackFieldError[] };

export function validateStarterPackBlocks(blocks: unknown): ValidateStarterPackBlocksResult {
  const structural = starterPackBlocksSchema.safeParse(blocks);
  if (!structural.success) {
    return {
      ok: false,
      fields: structural.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    };
  }

  const fields: StarterPackFieldError[] = [];
  structural.data.forEach((block, i) => {
    const schema = blockSchemaRegistry[block.blockType];
    const parsed = schema.safeParse(block.content);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const suffix = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
        fields.push({ field: `${i}.content${suffix}`, message: issue.message });
      });
    }
  });
  if (fields.length > 0) return { ok: false, fields };

  return { ok: true, data: structural.data as StarterPackBlock[] };
}
```

- [ ] **Step 4: Export from the site-blocks barrel**

In `packages/shared/src/site-blocks/index.ts`, append at the end of the file:

```ts
export {
  starterPackBlockSchema,
  starterPackBlocksSchema,
  validateStarterPackBlocks,
  type StarterPackBlock,
  type StarterPackFieldError,
  type ValidateStarterPackBlocksResult,
} from './starter-pack';
```

- [ ] **Step 5: Re-export from the top-level barrel**

In `packages/shared/src/index.ts`, add a new export line near the other `./site-blocks/index` re-exports (around line 121–139):

```ts
export {
  starterPackBlocksSchema,
  validateStarterPackBlocks,
  type StarterPackBlock,
  type StarterPackFieldError,
  type ValidateStarterPackBlocksResult,
} from './site-blocks/index';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/starter-pack.test.ts`
Expected: PASS (8 tests). Also run the existing `__tests__/site-blocks.test.ts` to confirm no cycle regression: `pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks.test.ts` → PASS.

- [ ] **Step 7: Typecheck the package (cache-free)**

Run: `pnpm --filter @propertypro/shared exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/site-blocks/starter-pack.ts packages/shared/src/site-blocks/index.ts packages/shared/src/index.ts packages/shared/__tests__/starter-pack.test.ts
git commit -m "$(printf 'Add starterPackBlocksSchema + validateStarterPackBlocks to @propertypro/shared\n\nValidates a starter pack'\''s blocks array: unique blockOrder, <=1 hero at\norder 1, non-hero at order >=2, and each block.content against\nblockSchemaRegistry. Shared by the admin CRUD routes.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 9: Push, PR, full-green CI, squash-merge** (workflow header). PR includes the spec + plan docs already committed on this branch.

---

## PR-B — Data-driven apply path

Branch off updated main: `claude/starter-packs-apply-latest`.

### Task B1: Latest-non-archived-per-type selection

**Files:**
- Modify: `apps/web/src/lib/services/starter-pack-service.ts`
- Test: `apps/web/__tests__/lib/services/starter-pack-service.test.ts`

- [ ] **Step 1: Read the current test file** to learn its mock shape.

Run: `sed -n '1,80p' apps/web/__tests__/lib/services/starter-pack-service.test.ts`
The test mocks `@propertypro/db` (`createScopedClient`, `siteBlocks`, `siteStarterPacks`), `@propertypro/db/unsafe` (`createUnscopedClient`), and `@propertypro/db/filters`. The unscoped client mock returns a chainable `select().from().where().limit()` resolving to pack rows.

- [ ] **Step 2: Write the failing test**

Add to `apps/web/__tests__/lib/services/starter-pack-service.test.ts` (inside the existing top-level `describe`, matching the file's existing mock setters; adapt names to the file's actual mock variables):

```ts
it('selects the highest-version non-archived pack for the community type', async () => {
  // Arrange: the catalog query resolves to the latest pack's blocks. Assert the
  // query was filtered to community_type + is_archived=false and ordered desc.
  setStarterPackRows([{ blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'v2' } }] }]);
  setExistingBlocks([]); // no published blocks yet → not idempotent-skipped
  const res = await applyStarterPackToCommunity(42, 'condo_718');
  expect(res.applied).toBe(true);
  expect(res.blockCount).toBe(1);
  // The where predicate must include community_type and is_archived=false (no hardcoded slug).
  const whereArg = getStarterPackWhereArg();
  const serialized = JSON.stringify(whereArg);
  expect(serialized).toContain('condo_718');
  expect(serialized).not.toContain('florida-condo-v1');
});

it('no-ops when every pack for the type is archived (no row returned)', async () => {
  setStarterPackRows([]); // query returns nothing
  setExistingBlocks([]);
  const res = await applyStarterPackToCommunity(42, 'condo_718');
  expect(res).toEqual({ applied: false, blockCount: 0, packSlug: null });
});
```

If the existing mock doesn't expose `getStarterPackWhereArg`/`setStarterPackRows`, extend the hoisted mock: capture the `.where(arg)` argument on the unscoped `select` chain and let a setter control the resolved rows (mirror the capture pattern already used for the scoped client). Keep the existing tests green.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/starter-pack-service.test.ts`
Expected: FAIL — current code filters by hardcoded slug, so the `not.toContain('florida-condo-v1')` assertion fails (and/or the all-archived case returns the v1 slug).

- [ ] **Step 4: Rewrite the selection in the service**

In `apps/web/src/lib/services/starter-pack-service.ts`:

1. Delete the `STARTER_PACK_SLUG_BY_TYPE` constant and the `packSlug` derivation/guard at the top of `applyStarterPackToCommunity`.
2. Add `desc`, `and`, `eq` to the `@propertypro/db/filters` import (it currently imports `eq`).
3. Replace the catalog query. The function keeps its signature `applyStarterPackToCommunity(communityId, communityType)` and the existing-blocks idempotency check unchanged; only the pack lookup changes:

```ts
  const scoped = createScopedClient(communityId);
  // queryWhere auto-injects community_id and deleted_at IS NULL; add isDraft=false to find published blocks.
  const existing = await scoped.queryWhere(siteBlocks, eq(siteBlocks.isDraft, false));
  if (existing.length > 0) {
    return { applied: false, blockCount: 0, packSlug: null };
  }

  const db = createUnscopedClient();
  // Latest non-archived pack for this community type. `version` is the
  // authority for "latest" (the slug's -vN suffix is a human label only).
  const packRows = await db
    .select({ slug: siteStarterPacks.slug, blocks: siteStarterPacks.blocks })
    .from(siteStarterPacks)
    .where(and(eq(siteStarterPacks.communityType, communityType), eq(siteStarterPacks.isArchived, false)))
    .orderBy(desc(siteStarterPacks.version), desc(siteStarterPacks.id))
    .limit(1);

  const pack = packRows[0];
  if (!pack || !Array.isArray(pack.blocks)) {
    return { applied: false, blockCount: 0, packSlug: null };
  }
  const packSlug = pack.slug;
```

The downstream insert loop is unchanged; it already returns `{ applied: true, blockCount: blocks.length, packSlug }`. Update any prior early-return `packSlug` references to `null` (there is no slug until a pack is found).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/starter-pack-service.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Guards + typecheck**

Run: `pnpm exec tsx scripts/verify-scoped-db-access.ts` → PASS (starter-pack-service.ts is already allowlisted).
Run: `pnpm --filter @propertypro/web exec tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/services/starter-pack-service.ts apps/web/__tests__/lib/services/starter-pack-service.test.ts
git commit -m "$(printf 'Apply latest non-archived starter pack per community type\n\nReplace the hardcoded *-v1 slug mapping in applyStarterPackToCommunity with\na query for the highest-version, non-archived pack matching the\ncommunity_type (version is the authority; slug is a label). Behavior-\npreserving with the seeded v1 packs; makes Save-as-new-version take effect\nfor new communities. No-ops when every pack for the type is archived.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 8: Push, PR, full-green CI, squash-merge.**

---

## PR-C — Admin CRUD routes

Branch off updated main: `claude/starter-packs-admin-routes`. Depends on PR-A (uses `validateStarterPackBlocks`).

### Task C1: Shared route helpers

**Files:**
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/_shared.ts`

- [ ] **Step 1: Write the helper module** (no test of its own — exercised by the route tests)

Create `apps/admin/src/app/api/admin/site-templates/starter-packs/_shared.ts`:

```ts
/**
 * Shared types + helpers for the Starter Packs admin routes.
 * site_starter_packs is NOT tenant-scoped; routes are gated by
 * requirePlatformAdmin() and use the RLS-bypassing admin client.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { StarterPackFieldError } from '@propertypro/shared';

export const COMMUNITY_TYPES = ['condo_718', 'hoa_720', 'apartment'] as const;
export const communityTypeSchema = z.enum(COMMUNITY_TYPES);

export const PACK_COLUMNS =
  'id, slug, display_name, community_type, description, blocks, version, is_archived, created_at, updated_at';

export interface StarterPackRow {
  id: number;
  slug: string;
  display_name: string;
  community_type: (typeof COMMUNITY_TYPES)[number];
  description: string | null;
  blocks: unknown;
  version: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export function shapePack(row: StarterPackRow) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    communityType: row.community_type,
    description: row.description,
    blocks: row.blocks,
    version: row.version,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validationErrorResponse(fields: StarterPackFieldError[]) {
  return NextResponse.json({ error: { message: 'Invalid starter pack blocks', fields } }, { status: 400 });
}

export function zodErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    { error: { message: 'Invalid request body', fields: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
    { status: 400 },
  );
}

/** Strip a trailing -vN from a slug to get the version-family base. */
export function baseSlug(slug: string): string {
  return slug.replace(/-v\d+$/, '');
}
```

- [ ] **Step 2: Commit** (helper + nothing else yet)

```bash
git add apps/admin/src/app/api/admin/site-templates/starter-packs/_shared.ts
git commit -m "$(printf 'Add Starter Packs admin route helpers (_shared.ts)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task C2: GET + POST route

**Files:**
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/route.ts`
- Test: `apps/admin/__tests__/site-templates/starter-packs-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/__tests__/site-templates/starter-packs-route.test.ts`. Mirror `theme-presets-post-route.test.ts`'s hoisted-mock skeleton; the `fromMock` must serve GET (`.select().eq?().order().order()`), the POST same-type COUNT (`.select(_, {count,head}).eq().eq()`), and the POST insert (`.insert().select().single()`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    requirePlatformAdminMock: vi.fn(),
    createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })),
    fromMock,
  };
});

vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { GET, POST } from '@/app/api/admin/site-templates/starter-packs/route';

const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };
const VALID_BLOCKS = [
  { blockType: 'hero', blockOrder: 1, content: HERO },
  { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
];

function postReq(body: unknown) {
  return new Request('http://localhost/api/admin/site-templates/starter-packs', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@b.co', role: 'super_admin' });
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/admin/site-templates/starter-packs', () => {
  it('200s and returns the shaped pack list', async () => {
    fromMock.mockReturnValue({
      select: () => ({ order: () => ({ order: () => Promise.resolve({
        data: [{ id: 1, slug: 'florida-condo-v1', display_name: 'FL Condo', community_type: 'condo_718', description: null, blocks: [], version: 1, is_archived: false, created_at: 't', updated_at: 't' }],
        error: null,
      }) }) }),
    });
    const res = await GET(new Request('http://localhost/api/admin/site-templates/starter-packs'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.packs[0]).toMatchObject({ slug: 'florida-condo-v1', communityType: 'condo_718', displayName: 'FL Condo' });
  });
});

describe('POST /api/admin/site-templates/starter-packs', () => {
  function wireInsert({ existingCount = 0 } = {}) {
    // First .from() call → same-type count; second → insert chain.
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: existingCount, error: null }) }) }) })
      .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({
        data: { id: 9, slug: 'apartment-v1', display_name: 'Apt', community_type: 'apartment', description: null, blocks: VALID_BLOCKS, version: 1, is_archived: false, created_at: 't', updated_at: 't' },
        error: null,
      }) }) }) });
  }

  it('201s and creates a pack when none exists for the type', async () => {
    wireInsert({ existingCount: 0 });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }));
    expect(res.status).toBe(201);
    expect((await res.json()).pack.slug).toBe('apartment-v1');
  });

  it('409s when a non-archived pack already exists for the community type', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v2', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }));
    expect(res.status).toBe(409);
  });

  it('400s on invalid blocks (duplicate blockOrder)', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: [
      { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } },
      { blockType: 'announcements', blockOrder: 2, content: { limit: 5 } },
    ] }));
    expect(res.status).toBe(400);
  });

  it('409s on duplicate slug (Postgres 23505)', async () => {
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) }) })
      .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }) });
    const res = await POST(postReq({ slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', blocks: VALID_BLOCKS }));
    expect(res.status).toBe(409);
  });

  it('400s on a bad communityType enum', async () => {
    const res = await POST(postReq({ slug: 'x-v1', displayName: 'X', communityType: 'mansion', blocks: VALID_BLOCKS }));
    expect(res.status).toBe(400);
  });

  it('rejects (throws) when not a platform admin', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new Error('not-admin'));
    await expect(GET(new Request('http://localhost/api/admin/site-templates/starter-packs'))).rejects.toThrow('not-admin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-route.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/admin/site-templates/starter-packs/route.ts`:

```ts
/**
 * Starter Packs admin API (collection).
 *
 * GET  /api/admin/site-templates/starter-packs — list (optional ?communityType=).
 * POST — create the FIRST pack for a community type (409 if one already exists
 *        non-archived; further versions go through [slug]/new-version).
 *
 * AUTHZ: requirePlatformAdmin gates the route; site_starter_packs is not
 * tenant-scoped. The admin middleware is the real gate; this in-handler call
 * is defense-in-depth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import {
  PACK_COLUMNS, StarterPackRow, communityTypeSchema, shapePack, validationErrorResponse, zodErrorResponse,
} from './_shared';

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();
  const ct = request.nextUrl.searchParams.get('communityType');
  let communityType: string | null = null;
  if (ct) {
    const parsed = communityTypeSchema.safeParse(ct);
    if (!parsed.success) return NextResponse.json({ error: { message: `Invalid communityType: ${ct}` } }, { status: 400 });
    communityType = parsed.data;
  }
  const db = createAdminTypedClient();
  let query = db.from('site_starter_packs').select(PACK_COLUMNS);
  if (communityType) query = query.eq('community_type', communityType);
  const { data, error } = await query.order('community_type', { ascending: true }).order('version', { ascending: false });
  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  return NextResponse.json({ packs: (data ?? []).map((r) => shapePack(r as StarterPackRow)) });
}

const postBodySchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be kebab-case ([a-z0-9-])'),
  displayName: z.string().min(1).max(120),
  communityType: communityTypeSchema,
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown(),
});

export async function POST(request: NextRequest) {
  await requirePlatformAdmin();
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: { message: 'Body must be valid JSON' } }, { status: 400 }); }
  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const blocks = validateStarterPackBlocks(body.blocks);
  if (!blocks.ok) return validationErrorResponse(blocks.fields);

  const db = createAdminTypedClient();

  // One non-archived lineage per community type — further versions via new-version.
  const { count, error: countErr } = await db
    .from('site_starter_packs')
    .select('id', { count: 'exact', head: true })
    .eq('community_type', body.communityType)
    .eq('is_archived', false);
  if (countErr) return NextResponse.json({ error: { message: countErr.message } }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: { message: `A starter pack already exists for ${body.communityType}; use "Save as new version" instead.` } },
      { status: 409 },
    );
  }

  const { data, error } = await db
    .from('site_starter_packs')
    .insert({
      slug: body.slug, display_name: body.displayName, community_type: body.communityType,
      description: body.description ?? null, blocks: blocks.data, version: 1, is_archived: false,
    })
    .select(PACK_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: { message: `Starter pack slug already exists: ${body.slug}` } }, { status: 409 });
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/admin/site-templates/starter-packs/route.ts apps/admin/__tests__/site-templates/starter-packs-route.test.ts
git commit -m "$(printf 'Add Starter Packs admin GET + POST routes\n\nGET lists (optional communityType filter). POST creates the first pack for a\ntype (409 if a non-archived one exists; further versions via new-version),\nvalidates blocks via validateStarterPackBlocks, 409 on dup slug.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task C3: PATCH + DELETE route

**Files:**
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/route.ts`
- Test: `apps/admin/__tests__/site-templates/starter-packs-slug-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/__tests__/site-templates/starter-packs-slug-route.test.ts` (same hoisted-mock skeleton). Cover: PATCH edits displayName/description/blocks; PATCH 404; PATCH 400 when no editable fields; PATCH 400 on invalid blocks; PATCH does NOT accept `communityType` (sending it has no effect / is ignored — assert the update payload omits community_type); DELETE archives (`is_archived=true`); DELETE 409 when it's the last non-archived pack for the type; DELETE idempotent when already archived; auth `.rejects.toThrow`.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return { requirePlatformAdminMock: vi.fn(), createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })), fromMock };
});
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { PATCH, DELETE } from '@/app/api/admin/site-templates/starter-packs/[slug]/route';

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
function patchReq(body: unknown) {
  return new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}
const ROW = { id: 1, slug: 'florida-condo-v1', display_name: 'FL', community_type: 'condo_718', description: null, blocks: [], version: 1, is_archived: false, created_at: 't', updated_at: 't' };

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue({ id: 'a', email: 'a@b.co', role: 'super_admin' });
});
afterEach(() => vi.restoreAllMocks());

describe('PATCH [slug]', () => {
  it('200s and updates display_name', async () => {
    let captured: Record<string, unknown> = {};
    fromMock.mockReturnValueOnce({ update: (u: Record<string, unknown>) => { captured = u; return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...ROW, display_name: 'New' }, error: null }) }) }) }; } });
    const res = await PATCH(patchReq({ displayName: 'New', communityType: 'apartment' }), ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect(captured).toHaveProperty('display_name', 'New');
    expect(captured).not.toHaveProperty('community_type'); // immutable — ignored
  });

  it('400s when no editable fields are supplied', async () => {
    const res = await PATCH(patchReq({}), ctx('florida-condo-v1'));
    expect(res.status).toBe(400);
  });

  it('404s when the pack is missing', async () => {
    fromMock.mockReturnValueOnce({ update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) }) });
    const res = await PATCH(patchReq({ displayName: 'X' }), ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('400s on invalid blocks', async () => {
    const res = await PATCH(patchReq({ blocks: [{ blockType: 'hero', blockOrder: 2, content: {} }] }), ctx('florida-condo-v1'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE [slug] (archive)', () => {
  it('409s when it is the last non-archived pack for the type', async () => {
    // 1) read pack; 2) count OTHER non-archived for type → 0
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: false }, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => Promise.resolve({ count: 0, error: null }) }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx('florida-condo-v1'));
    expect(res.status).toBe(409);
  });

  it('archives when another non-archived pack remains for the type', async () => {
    let captured: Record<string, unknown> = {};
    fromMock
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: false }, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ neq: () => Promise.resolve({ count: 1, error: null }) }) }) }) })
      .mockReturnValueOnce({ update: (u: Record<string, unknown>) => { captured = u; return { eq: () => Promise.resolve({ error: null }) }; } });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect(captured).toHaveProperty('is_archived', true);
    expect((await res.json())).toEqual({ archived: true, deleted: false });
  });

  it('is idempotent when already archived (no last-pack guard needed)', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 1, community_type: 'condo_718', is_archived: true }, error: null }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx('florida-condo-v1'));
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual({ archived: true, deleted: false });
  });

  it('404s when the pack is missing', async () => {
    fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) });
    const res = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), ctx('nope'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-slug-route.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/route.ts`:

```ts
/**
 * Starter Packs admin API (per-slug).
 * PATCH  — in-place edit (displayName, description, blocks, isArchived). slug
 *          AND community_type are immutable; version unchanged (versioning is
 *          explicit via new-version).
 * DELETE — archive (is_archived=true). 409 if it is the last non-archived pack
 *          for its community_type (would leave new communities empty).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import { PACK_COLUMNS, StarterPackRow, shapePack, validationErrorResponse, zodErrorResponse } from '../_shared';

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown().optional(),
  isArchived: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: { message: 'Body must be valid JSON' } }, { status: 400 }); }
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.description !== undefined) update.description = body.description;
  if (body.isArchived !== undefined) update.is_archived = body.isArchived;
  if (body.blocks !== undefined) {
    const blocks = validateStarterPackBlocks(body.blocks);
    if (!blocks.ok) return validationErrorResponse(blocks.fields);
    update.blocks = blocks.data;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: { message: 'No editable fields supplied' } }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const db = createAdminTypedClient();
  const { data, error } = await db.from('site_starter_packs').update(update).eq('slug', slug).select(PACK_COLUMNS).single();
  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  const db = createAdminTypedClient();

  const { data: pack, error: readErr } = await db
    .from('site_starter_packs').select('id, community_type, is_archived').eq('slug', slug).single();
  if (readErr) {
    if (readErr.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    return NextResponse.json({ error: { message: readErr.message } }, { status: 500 });
  }
  const row = pack as { id: number; community_type: string; is_archived: boolean };

  if (row.is_archived) {
    // Already archived — idempotent no-op.
    return NextResponse.json({ archived: true, deleted: false });
  }

  // Refuse to archive the LAST non-archived pack for the type.
  const { count, error: cErr } = await db
    .from('site_starter_packs').select('id', { count: 'exact', head: true })
    .eq('community_type', row.community_type).eq('is_archived', false).neq('id', row.id);
  if (cErr) return NextResponse.json({ error: { message: cErr.message } }, { status: 500 });
  if ((count ?? 0) === 0) {
    return NextResponse.json(
      { error: { message: `Cannot archive the only starter pack for ${row.community_type}; create or unarchive a replacement first.` } },
      { status: 409 },
    );
  }

  const { error: archiveErr } = await db
    .from('site_starter_packs').update({ is_archived: true, updated_at: new Date().toISOString() }).eq('slug', slug);
  if (archiveErr) return NextResponse.json({ error: { message: archiveErr.message } }, { status: 500 });
  return NextResponse.json({ archived: true, deleted: false });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-slug-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/admin/site-templates/starter-packs/\[slug\]/route.ts apps/admin/__tests__/site-templates/starter-packs-slug-route.test.ts
git commit -m "$(printf 'Add Starter Packs admin PATCH + DELETE(archive) routes\n\nPATCH edits displayName/description/blocks/isArchived (slug + community_type\nimmutable; version unchanged). DELETE archives, 409 if it is the last\nnon-archived pack for its community_type.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task C4: new-version route

**Files:**
- Create: `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/new-version/route.ts`
- Test: `apps/admin/__tests__/site-templates/starter-packs-new-version-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/__tests__/site-templates/starter-packs-new-version-route.test.ts`. Cover: derives `florida-condo-v1` → `florida-condo-v2` with `version=2`; copies base blocks when body omits them; re-validates body-supplied blocks (400 on invalid); 404 on missing base; 409 on slug collision (23505).

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, createAdminTypedClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return { requirePlatformAdminMock: vi.fn(), createAdminTypedClientMock: vi.fn(() => ({ from: fromMock })), fromMock };
});
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: requirePlatformAdminMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({ createAdminTypedClient: createAdminTypedClientMock }));

import { POST } from '@/app/api/admin/site-templates/starter-packs/[slug]/new-version/route';

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const HERO = { headline: 'Welcome', subtitle: 'A community.', ctaText: 'Resident Login', ctaTarget: '/auth/login' };
const BASE = { id: 1, slug: 'florida-condo-v1', display_name: 'FL', community_type: 'condo_718', description: 'd', blocks: [{ blockType: 'hero', blockOrder: 1, content: HERO }], version: 1, is_archived: false, created_at: 't', updated_at: 't' };
function req(body: unknown) { return new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body ?? {}), headers: { 'content-type': 'application/json' } }); }

beforeEach(() => { vi.clearAllMocks(); requirePlatformAdminMock.mockResolvedValue({ id: 'a', email: 'a@b.co', role: 'super_admin' }); });
afterEach(() => vi.restoreAllMocks());

it('creates florida-condo-v2 at version 2, copying base blocks', async () => {
  let inserted: Record<string, unknown> = {};
  fromMock
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) })
    .mockReturnValueOnce({ insert: (v: Record<string, unknown>) => { inserted = v; return { select: () => ({ single: () => Promise.resolve({ data: { ...BASE, id: 2, slug: 'florida-condo-v2', version: 2 }, error: null }) }) }; } });
  const res = await POST(req({}), ctx('florida-condo-v1'));
  expect(res.status).toBe(201);
  expect(inserted).toMatchObject({ slug: 'florida-condo-v2', version: 2, community_type: 'condo_718' });
  expect((await res.json()).pack.slug).toBe('florida-condo-v2');
});

it('404s when the base pack is missing', async () => {
  fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) }) }) });
  const res = await POST(req({}), ctx('nope'));
  expect(res.status).toBe(404);
});

it('400s on invalid body-supplied blocks', async () => {
  fromMock.mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) });
  const res = await POST(req({ blocks: [{ blockType: 'hero', blockOrder: 5, content: HERO }] }), ctx('florida-condo-v1'));
  expect(res.status).toBe(400);
});

it('409s on slug collision', async () => {
  fromMock
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: BASE, error: null }) }) }) })
    .mockReturnValueOnce({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }) }) }) });
  const res = await POST(req({}), ctx('florida-condo-v1'));
  expect(res.status).toBe(409);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-new-version-route.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the route**

Create `apps/admin/src/app/api/admin/site-templates/starter-packs/[slug]/new-version/route.ts`:

```ts
/**
 * POST /api/admin/site-templates/starter-packs/[slug]/new-version
 * Creates the next version (version+1) from an existing base pack. The new
 * slug is a derived human label (baseSlug -vN); the version integer is the
 * ordering authority. Base is left as-is. Blocks default to the base's,
 * re-validated; the body may override displayName/description/blocks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { validateStarterPackBlocks } from '@propertypro/shared';
import { PACK_COLUMNS, StarterPackRow, baseSlug, shapePack, validationErrorResponse, zodErrorResponse } from '../../_shared';

const bodySchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  blocks: z.unknown().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  await requirePlatformAdmin();
  const { slug } = await context.params;
  let json: unknown = {};
  try { json = await request.json(); } catch { /* empty body allowed */ }
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;

  const db = createAdminTypedClient();
  const { data: baseData, error: readErr } = await db.from('site_starter_packs').select(PACK_COLUMNS).eq('slug', slug).single();
  if (readErr) {
    if (readErr.code === 'PGRST116') return NextResponse.json({ error: { message: `Starter pack not found: ${slug}` } }, { status: 404 });
    return NextResponse.json({ error: { message: readErr.message } }, { status: 500 });
  }
  const base = baseData as StarterPackRow;

  const newVersion = base.version + 1;
  const newSlug = `${baseSlug(base.slug)}-v${newVersion}`;
  const sourceBlocks = body.blocks !== undefined ? body.blocks : base.blocks;
  const blocks = validateStarterPackBlocks(sourceBlocks);
  if (!blocks.ok) return validationErrorResponse(blocks.fields);

  const { data, error } = await db
    .from('site_starter_packs')
    .insert({
      slug: newSlug,
      display_name: body.displayName ?? base.display_name,
      community_type: base.community_type,
      description: body.description !== undefined ? body.description : base.description,
      blocks: blocks.data, version: newVersion, is_archived: false,
    })
    .select(PACK_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: { message: `Version slug already exists: ${newSlug}` } }, { status: 409 });
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ pack: shapePack(data as StarterPackRow) }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-new-version-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + guards**

Run: `pnpm --filter @propertypro/admin exec tsc --noEmit` → exit 0.
Run: `pnpm exec tsx scripts/verify-scoped-db-access.ts` → PASS (admin uses the admin typed client; no scoped-db concern).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/api/admin/site-templates/starter-packs/\[slug\]/new-version/route.ts apps/admin/__tests__/site-templates/starter-packs-new-version-route.test.ts
git commit -m "$(printf 'Add Starter Packs admin new-version route\n\nPOST [slug]/new-version creates version+1 from a base pack (derived -vN label\nslug; version is authority), copying + re-validating blocks. 404 missing base,\n409 slug collision.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 7: Push, PR (Tasks C1–C4 one PR), full-green CI, squash-merge.**

---

## PR-D — Admin UI

Branch off updated main: `claude/starter-packs-admin-ui`. Depends on PR-C.

### Task D1: Block editor component

**Files:**
- Create: `apps/admin/src/components/site-templates/StarterPackBlocksEditor.tsx`
- Test: covered via the table test (D3); the editor is exercised through it.

- [ ] **Step 1: Write the component**

Create `apps/admin/src/components/site-templates/StarterPackBlocksEditor.tsx`:

```tsx
'use client';

/**
 * Edits a starter pack's blocks array. Compact fields for the six simple block
 * types (hero, text, announcements, documents, meetings, contact); a validated
 * JSON textarea for image/gallery/faq/amenities (see spec §8). Server-side
 * validateStarterPackBlocks is authoritative regardless of input path.
 */
import { useState } from 'react';

export interface EditorBlock { blockType: string; blockOrder: number; content: Record<string, unknown>; }

const BLOCK_TYPES = ['hero', 'text', 'announcements', 'documents', 'meetings', 'contact', 'image', 'gallery', 'faq', 'amenities'] as const;
const JSON_TYPES = new Set(['image', 'gallery', 'faq', 'amenities']);

interface Props {
  value: EditorBlock[];
  onChange: (next: EditorBlock[]) => void;
}

export function StarterPackBlocksEditor({ value, onChange }: Props) {
  const setBlock = (i: number, patch: Partial<EditorBlock>) =>
    onChange(value.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    [next[i].blockOrder, next[j].blockOrder] = [next[j].blockOrder, next[i].blockOrder];
    onChange(next);
  };
  const add = () => {
    const nextOrder = value.length === 0 ? 1 : Math.max(...value.map((b) => b.blockOrder)) + 1;
    onChange([...value, { blockType: nextOrder === 1 ? 'hero' : 'text', blockOrder: nextOrder, content: {} }]);
  };

  return (
    <div className="space-y-3" data-testid="blocks-editor">
      {value.map((b, i) => (
        <div key={i} className="rounded border border-gray-200 p-3" data-testid={`block-row-${i}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">#{b.blockOrder}</span>
            <select
              aria-label={`Block ${i + 1} type`}
              data-testid={`block-type-${i}`}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
              value={b.blockType}
              onChange={(e) => setBlock(i, { blockType: e.target.value })}
            >
              {BLOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="ml-auto flex gap-1">
              <button type="button" aria-label={`Move block ${i + 1} up`} disabled={i === 0}
                className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40" onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label={`Move block ${i + 1} down`} disabled={i === value.length - 1}
                className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-40" onClick={() => move(i, 1)}>↓</button>
              <button type="button" aria-label={`Remove block ${i + 1}`}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={() => remove(i)}>Remove</button>
            </div>
          </div>
          <BlockContentFields type={b.blockType} content={b.content} onChange={(c) => setBlock(i, { content: c })} index={i} />
        </div>
      ))}
      <button type="button" data-testid="add-block" className="rounded border border-gray-300 px-3 py-1.5 text-sm" onClick={add}>+ Add block</button>
    </div>
  );
}

function BlockContentFields({ type, content, onChange, index }: { type: string; content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; index: number }) {
  if (JSON_TYPES.has(type)) {
    return <JsonField content={content} onChange={onChange} index={index} />;
  }
  const num = (k: string) => (content[k] as number | undefined) ?? '';
  const str = (k: string) => (content[k] as string | undefined) ?? '';
  const bool = (k: string) => Boolean(content[k]);
  const set = (k: string, v: unknown) => onChange({ ...content, [k]: v });
  const numField = (k: string, label: string) => (
    <label className="block text-xs text-gray-600">{label}
      <input type="number" data-testid={`field-${index}-${k}`} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        value={num(k)} onChange={(e) => set(k, e.target.value === '' ? undefined : Number(e.target.value))} />
    </label>
  );
  const textField = (k: string, label: string) => (
    <label className="block text-xs text-gray-600">{label}
      <input type="text" data-testid={`field-${index}-${k}`} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        value={str(k)} onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  const boolField = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <input type="checkbox" data-testid={`field-${index}-${k}`} checked={bool(k)} onChange={(e) => set(k, e.target.checked)} />{label}
    </label>
  );

  switch (type) {
    case 'hero':
      return <div className="grid grid-cols-2 gap-2">{textField('headline', 'Headline')}{textField('subtitle', 'Subtitle')}{textField('ctaText', 'CTA text')}{textField('ctaTarget', 'CTA target')}</div>;
    case 'text':
      return <div className="grid grid-cols-2 gap-2">{textField('heading', 'Heading (optional)')}{textField('body', 'Body')}</div>;
    case 'announcements':
    case 'meetings':
      return <div className="grid grid-cols-2 gap-2">{numField('limit', 'Limit')}{numField('timeWindowDays', 'Time window (days)')}</div>;
    case 'documents':
      return <div className="grid grid-cols-2 gap-2">{numField('limit', 'Limit')}
        <label className="block text-xs text-gray-600">Categories (comma-separated)
          <input type="text" data-testid={`field-${index}-includeCategories`} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={(content.includeCategories as string[] | undefined)?.join(',') ?? ''}
            onChange={(e) => onChange({ ...content, includeCategories: e.target.value ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean) : [] })} />
        </label></div>;
    case 'contact':
      return <div className="flex gap-4">{boolField('showBoard', 'Show board')}{boolField('showManagement', 'Show management')}</div>;
    default:
      return null;
  }
}

function JsonField({ content, onChange, index }: { content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; index: number }) {
  const [raw, setRaw] = useState(() => JSON.stringify(content, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <textarea data-testid={`field-${index}-json`} className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs" rows={6}
        value={raw} onChange={(e) => {
          setRaw(e.target.value);
          try { onChange(JSON.parse(e.target.value)); setErr(null); } catch { setErr('Invalid JSON'); }
        }} />
      {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @propertypro/admin exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/site-templates/StarterPackBlocksEditor.tsx
git commit -m "$(printf 'Add StarterPackBlocksEditor (admin)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task D2: StarterPacksTable component

**Files:**
- Create: `apps/admin/src/components/site-templates/StarterPacksTable.tsx`

- [ ] **Step 1: Write the component** (mirrors `ThemePresetsTable`: `useState` + `fetch`, `data-testid`-driven)

Create `apps/admin/src/components/site-templates/StarterPacksTable.tsx`:

```tsx
'use client';

/**
 * Starter Packs catalog table with inline edit + new-version + archive.
 * Mirrors ThemePresetsTable (plain fetch + useState; no react-query). Calls the
 * /api/admin/site-templates/starter-packs routes.
 */
import { useMemo, useState } from 'react';
import { StarterPackBlocksEditor, type EditorBlock } from './StarterPackBlocksEditor';

export interface StarterPackRow {
  id: number; slug: string; displayName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  description: string | null; blocks: EditorBlock[]; version: number;
  isArchived: boolean; createdAt: string; updatedAt: string;
}

const API = '/api/admin/site-templates/starter-packs';

async function readError(res: Response): Promise<string> {
  try { const b = await res.json() as { error?: { message?: string } }; return b.error?.message ?? `Request failed (${res.status})`; }
  catch { return `Request failed (${res.status})`; }
}

export function StarterPacksTable({ packs: initial }: { packs: StarterPackRow[] }) {
  const [rows, setRows] = useState<StarterPackRow[]>(initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<EditorBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const visible = useMemo(
    () => rows.filter((r) => typeFilter === 'all' || r.communityType === typeFilter),
    [rows, typeFilter],
  );

  async function refresh() {
    const res = await fetch(API);
    if (res.ok) { const b = await res.json() as { packs: StarterPackRow[] }; setRows(b.packs); }
  }

  function startEdit(row: StarterPackRow) { setEditingId(row.id); setDraftBlocks(row.blocks ?? []); setError(null); }

  async function saveEdit(slug: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/${slug}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: draftBlocks }) });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function saveNewVersion(slug: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/${slug}/new-version`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: draftBlocks }) });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function setArchived(slug: string, archived: boolean) {
    setBusy(true); setError(null);
    try {
      const res = archived
        ? await fetch(`${API}/${slug}`, { method: 'DELETE' })
        : await fetch(`${API}/${slug}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isArchived: false }) });
      if (!res.ok) throw new Error(await readError(res));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); }
  }

  return (
    <div>
      {error && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="mb-3 block text-sm text-gray-600">Filter by type
        <select data-testid="type-filter" className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All</option><option value="condo_718">condo_718</option><option value="hoa_720">hoa_720</option><option value="apartment">apartment</option>
        </select>
      </label>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Name</th><th>Slug</th><th>Type</th><th>Version</th><th>Blocks</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 align-top" data-testid={`pack-row-${row.slug}`}>
              <td className="py-2">{row.displayName}</td>
              <td className="font-mono text-xs">{row.slug}</td>
              <td>{row.communityType}</td>
              <td>{row.version}</td>
              <td>{(row.blocks ?? []).length}</td>
              <td>{row.isArchived ? <span className="text-gray-400">Archived</span> : <span className="text-green-700">Active</span>}</td>
              <td>
                {editingId === row.id ? (
                  <div className="space-y-2" data-testid={`pack-edit-${row.slug}`}>
                    <StarterPackBlocksEditor value={draftBlocks} onChange={setDraftBlocks} />
                    <div className="flex gap-2">
                      <button type="button" data-testid={`pack-save-${row.slug}`} disabled={busy} className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => saveEdit(row.slug)}>Save</button>
                      <button type="button" data-testid={`pack-newversion-${row.slug}`} disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => saveNewVersion(row.slug)}>Save as new version</button>
                      <button type="button" disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" data-testid={`pack-editbtn-${row.slug}`} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" data-testid={`pack-archive-${row.slug}`} disabled={busy} className="rounded border border-gray-300 px-2 py-1 text-xs" onClick={() => setArchived(row.slug, !row.isArchived)}>{row.isArchived ? 'Unarchive' : 'Archive'}</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @propertypro/admin exec tsc --noEmit` → exit 0.

```bash
git add apps/admin/src/components/site-templates/StarterPacksTable.tsx
git commit -m "$(printf 'Add StarterPacksTable (admin)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task D3: Component test

**Files:**
- Test: `apps/admin/__tests__/site-templates/starter-packs-table.test.tsx`

- [ ] **Step 1: Write the test** (mirror `theme-presets-table.test.tsx` — `createRoot`/`act`; controlled inputs via native setter + `input` event where needed)

Create `apps/admin/__tests__/site-templates/starter-packs-table.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StarterPacksTable, type StarterPackRow } from '@/components/site-templates/StarterPacksTable';

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); global.fetch = vi.fn(); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const PACKS: StarterPackRow[] = [
  { id: 1, slug: 'florida-condo-v1', displayName: 'FL Condo', communityType: 'condo_718', description: null, blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'Hi' } }, { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } }], version: 1, isArchived: false, createdAt: 't', updatedAt: 't' },
  { id: 2, slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', description: null, blocks: [], version: 1, isArchived: false, createdAt: 't', updatedAt: 't' },
];

function render(packs: StarterPackRow[]) { act(() => root.render(<StarterPacksTable packs={packs} />)); }
function click(testid: string) { const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement; act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }

describe('StarterPacksTable', () => {
  it('renders all packs and a type filter', () => {
    render(PACKS);
    expect(container.querySelector('[data-testid="pack-row-florida-condo-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pack-row-apartment-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="type-filter"]')).toBeTruthy();
  });

  it('filters by community type', () => {
    render(PACKS);
    const filter = container.querySelector('[data-testid="type-filter"]') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    act(() => { setter.call(filter, 'apartment'); filter.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[data-testid="pack-row-apartment-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pack-row-florida-condo-v1"]')).toBeFalsy();
  });

  it('Archive POSTs DELETE then refreshes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ archived: true, deleted: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    await act(async () => { click('pack-archive-florida-condo-v1'); });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1');
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('Edit → Save PATCHes blocks', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pack: PACKS[0] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    click('pack-editbtn-florida-condo-v1');
    await act(async () => { click('pack-save-florida-condo-v1'); });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1');
    expect(call[1]).toMatchObject({ method: 'PATCH' });
  });

  it('Save as new version POSTs to new-version', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pack: { ...PACKS[0], slug: 'florida-condo-v2', version: 2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    click('pack-editbtn-florida-condo-v1');
    await act(async () => { click('pack-newversion-florida-condo-v1'); });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1/new-version');
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (after writing it, it should pass against D2's component — if any selector mismatches, fix the test to match the component, not vice-versa, since the component is already TDD-free UI)

Run: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/starter-packs-table.test.tsx`
Expected: PASS.

> Note: D1/D2 are presentational React with no pure logic to TDD; their behavior is verified by this D3 test (the established admin pattern — see `theme-presets-table.test.tsx`). If you prefer strict TDD, write D3 first and run it (RED: component missing) before D1/D2.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/__tests__/site-templates/starter-packs-table.test.tsx
git commit -m "$(printf 'Add StarterPacksTable component test\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

### Task D4: Page + nav link

**Files:**
- Create: `apps/admin/src/app/site-templates/starter-packs/page.tsx`
- Modify: `apps/admin/src/app/site-templates/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/admin/src/app/site-templates/starter-packs/page.tsx`:

```tsx
/**
 * /admin/site-templates/starter-packs — platform-admin starter pack catalog.
 * AUTHZ: requireAdminPageSession(); site_starter_packs is not tenant-scoped.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { StarterPacksTable, type StarterPackRow } from '@/components/site-templates/StarterPacksTable';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: number; slug: string; display_name: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  description: string | null; blocks: unknown; version: number; is_archived: boolean; created_at: string; updated_at: string;
}

async function loadPacks(): Promise<StarterPackRow[]> {
  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_starter_packs')
    .select('id, slug, display_name, community_type, description, blocks, version, is_archived, created_at, updated_at')
    .order('community_type', { ascending: true })
    .order('version', { ascending: false });
  if (error) throw new Error(`Failed to load starter packs: ${error.message}`);
  return ((data ?? []) as RawRow[]).map((r) => ({
    id: r.id, slug: r.slug, displayName: r.display_name, communityType: r.community_type,
    description: r.description, blocks: (Array.isArray(r.blocks) ? r.blocks : []) as StarterPackRow['blocks'],
    version: r.version, isArchived: r.is_archived, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export default async function StarterPacksPage() {
  await requireAdminPageSession();
  const packs = await loadPacks();
  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Starter Packs</h1>
          <p className="mt-1 text-sm text-gray-500">Platform-level block bundles applied to new community sites. Edit in place, or "Save as new version" to publish a new lineage version. Archived packs are retired from new-community seeding.</p>
        </div>
        <StarterPacksTable packs={packs} />
      </div>
    </AdminLayout>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `apps/admin/src/app/site-templates/page.tsx`, next to the existing `href="/site-templates/theme-presets"` link block, add:

```tsx
            <a
              href="/site-templates/starter-packs"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Starter Packs →
            </a>
```

(Match the exact `className` of the sibling links in that file.)

- [ ] **Step 3: Typecheck + a real admin build (page is a new server component)**

Run: `pnpm --filter @propertypro/admin exec tsc --noEmit` → exit 0.
Run a real admin build to catch any client/server boundary issue:
```bash
DATABASE_URL="postgresql://u:p@localhost:5432/db" DIRECT_URL="postgresql://u:p@localhost:5432/db" \
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" \
pnpm --filter @propertypro/admin build
```
Expected: build succeeds; `/site-templates/starter-packs` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/site-templates/starter-packs/page.tsx apps/admin/src/app/site-templates/page.tsx
git commit -m "$(printf 'Add Starter Packs admin page + nav link\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 5: Full verify + push, PR (Tasks D1–D4 one PR), full-green CI, squash-merge.**

Run before pushing: `pnpm --filter @propertypro/admin exec vitest run __tests__/site-templates/` (all admin site-template tests green); `pnpm --filter @propertypro/admin exec tsc --noEmit`.

---

## Self-Review

**Spec coverage:**
- §3.1 explicit versioning → Task C4 (new-version), C3 (PATCH no version change). ✓
- §3.2 structured editor → Task D1. ✓
- §3.3 apply latest-non-archived → Task B1. ✓
- §3.4 archive-only delete → Task C3 (DELETE archives, no hard delete). ✓
- §5 validation (unique order, hero rules, ≥1 block, per-block content) → Task A1. ✓
- §7 routes (GET/POST/PATCH/new-version/DELETE incl. all three 409s) → Tasks C2–C4. ✓
- §8 UI (table, block editor, nav, compact vs JSON) → Tasks D1–D4. ✓
- §9 testing (shared, apply, route matrix incl. auth `.rejects.toThrow`, component) → A1, B1, C2–C4, D3. ✓
- §11/§12 limitations/scope → no tasks needed (documented constraints). ✓

**Placeholder scan:** none — every code/test step shows full content.

**Type consistency:** `validateStarterPackBlocks` returns `{ ok, data|fields }` (A1) and is consumed identically in C2/C3/C4 routes. `shapePack`/`StarterPackRow`/`PACK_COLUMNS`/`baseSlug`/`communityTypeSchema` defined in `_shared.ts` (C1) and imported by C2/C3/C4. `EditorBlock` defined in D1, imported by D2/D3. `StarterPackRow` (camelCase UI shape) defined in D2, imported by D3/D4. API base path `'/api/admin/site-templates/starter-packs'` consistent across D2 and tests.

**One consistency note for the executor:** the `_shared.ts` import path differs by directory depth — `./_shared` from `route.ts`, `../_shared` from `[slug]/route.ts`, `../../_shared` from `[slug]/new-version/route.ts`. The plan's import lines already reflect this.

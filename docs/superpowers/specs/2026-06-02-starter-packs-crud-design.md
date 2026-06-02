# Starter Packs CRUD (§5.3) — Design

**Date:** 2026-06-02
**Status:** Approved (brainstorming) → ready for implementation plan
**Parent spec:** `docs/superpowers/specs/2026-05-26-property-landing-page-design.md` §2.6 (starter-pack data model), §5.3 (admin Starter Packs CRUD), §5.6 (admin API routes)

## 1. Summary

Build the platform-admin Starter Packs management surface (§5.3). A starter
pack is a platform-level bundle of site blocks that seeds a new community's
public site at creation time. Today the catalog table (`site_starter_packs`)
exists and is seeded with one pack per community type, the web apply path
(`applyStarterPackToCommunity`) copies a pack's blocks into `site_blocks` at
community creation, and an admin `reset-to-starter` flow re-applies a pack by
slug — **but there is no admin CRUD** for the catalog itself. This work adds
it: list / create / edit / version / archive, plus a structured block editor,
and wires versioning through to the apply path so new versions actually take
effect.

**No database migration is required** — `site_starter_packs` already exists
(migration `0004_site_blocks_foundation.sql`).

## 2. Root cause / motivating insight

The naive framing ("add a CRUD screen") would ship a feature that does nothing
live: `applyStarterPackToCommunity` **hardcodes** the `*-v1` slug per community
type (`STARTER_PACK_SLUG_BY_TYPE`), so any pack an admin created or edited would
never reach a new community. The core of this work is therefore two-part:

1. Make the catalog editable (admin CRUD).
2. Make the apply path **data-driven** — select the latest non-archived pack
   for the community type — so versioning is meaningful end to end.

## 3. Decisions (locked during brainstorming)

1. **Explicit new-row versions.** In-place edits update a pack's blocks on the
   same row without changing `version`. A separate "Save as new version" action
   creates a **new row** with `version = N+1` and a derived label slug
   (`florida-condo-v1` → `florida-condo-v2`), preserving immutable history.
   Matches §5.3 ("existing communities continue to be tied to their installed
   version"). **`version` is server-assigned** (create → 1, new-version → N+1);
   the client never sets it. **The slug is an opaque unique label** — no code
   parses `-vN`; the `-vN` suffix is a human convenience derived from the
   version integer, not a source of truth. (Review fix #2: single source of
   truth for "latest" = the `version` integer.)
2. **Structured block-list editor.** Add / remove / reorder block entries; each
   entry has a `blockType` select, a `blockOrder`, and content edited via a
   compact per-type field set for the no-upload types (hero, text,
   announcements, documents, meetings, contact) and a validated JSON area for
   the rest (image, gallery, faq, amenities). Every block is validated against
   `blockSchemaRegistry` on save server-side regardless of the input UI.
3. **Apply selection = latest non-archived per type.** `applyStarterPackToCommunity`
   selects the highest-`version`, non-archived pack matching `community_type`
   (ties broken by `id desc`). The `version` **integer** is the source of truth
   for "latest" — the apply query does NOT parse the slug.
4. **Delete = archive-only, reversible.** "Delete" sets `is_archived=true`
   (retired from apply selection + hidden from the default catalog view), kept
   forever and reversible via Unarchive. No hard delete. Sidesteps the
   missing-provenance problem (`site_blocks` don't record their seeding pack)
   and honors the immutable-history intent.

## 4. Data model

`site_starter_packs` (existing — `packages/db/src/schema/site-starter-packs.ts`):

| column          | type        | notes |
|-----------------|-------------|-------|
| `id`            | bigserial   | PK |
| `slug`          | text unique | e.g. `florida-condo-v2` |
| `display_name`  | text        | |
| `community_type`| text        | `condo_718` \| `hoa_720` \| `apartment` (CHECK) |
| `description`   | text null   | |
| `blocks`        | jsonb       | array of `{ blockType, blockOrder, content }` |
| `version`       | integer     | default 1; source of truth for "latest" |
| `is_archived`   | boolean     | default false |
| `created_at` / `updated_at` | timestamptz | |

No schema change. The table is intentionally **not** tenant-scoped and **not**
RLS-protected (platform catalog; documented in migration 0004). Admin writes
use `createAdminTypedClient()` (RLS-bypass by design); the web apply path reads
via the allowlisted `createUnscopedClient()`.

## 5. Shared validation (`packages/shared/src/site-blocks/starter-pack.ts`)

New module, importable by both the admin app and web (both depend on
`@propertypro/shared`):

- `starterPackBlockSchema` — `{ blockType: blockTypeSchema, blockOrder: int ≥ 1,
  content: unknown }` where `content` is then validated by
  `blockSchemaRegistry[blockType]`.
- `starterPackBlocksSchema` — `z.array(...).min(1)` with `.superRefine`:
  - **unique `blockOrder`** across the array (duplicate orders would collide on
    the `site_blocks` partial unique index `(community_id, block_order, is_draft)`
    at apply time → 500 during community creation);
  - **at most one `hero`** block; if a `hero` is present it must be at
    `blockOrder === 1`; non-hero blocks must be at `blockOrder ≥ 2`.
- `validateStarterPackBlocks(blocks): { ok: true; data } | { ok: false; fields }`
  — runs the array schema, then per-entry `blockSchemaRegistry[blockType].safeParse(content)`,
  aggregating field errors as `{ field, message }[]` (shape matches the admin
  routes' existing error envelope).

Unit-tested with valid + each invalid variant (unknown type, bad content,
duplicate order, hero misplacement, empty array).

## 6. Web apply path (`apps/web/src/lib/services/starter-pack-service.ts`)

Replace the hardcoded `STARTER_PACK_SLUG_BY_TYPE` lookup with a query:

```
select blocks from site_starter_packs
where community_type = $type and is_archived = false
order by version desc, id desc
limit 1
```

- If a row is found, apply its blocks exactly as today (existing-blocks
  idempotency check unchanged).
- If none found (all archived / none seeded), no-op `{ applied: false,
  blockCount: 0, packSlug: null }` — preserves the existing defensive behavior.
- Return the selected pack's slug in `packSlug` (now dynamic).

**Behavior-preserving today:** with only the seeded `*-v1` packs present, the
query returns the v1 pack — identical to the hardcoded mapping. Versioning only
changes behavior once a v2 exists. Update `starter-pack-service.test.ts`
accordingly (mock the catalog query; assert latest-non-archived selection and
the all-archived no-op).

**Assumption:** one logical pack family per `community_type` in v1 (matches the
seed). "Latest per type" therefore selects unambiguously. If multiple families
per type are introduced later, selection would need a family/base-slug grouping —
out of scope, documented here.

## 7. Admin API (`apps/admin/src/app/api/admin/site-templates/starter-packs/`)

Mirrors the theme-presets routes: `createAdminTypedClient()` +
`requirePlatformAdmin()` + plain Zod + `NextResponse`; error envelope
`{ error: { message, fields? } }`; row→camelCase `shape()` helper.

### `route.ts`
- **`GET`** — list all packs; optional `?communityType=` filter (validated
  enum). Order by `community_type asc, version desc`. Returns `{ packs: [...] }`.
- **`POST`** — create the **first** pack for a community type. Body:
  `{ slug (kebab regex), displayName, communityType (enum), description?,
  blocks }`. `version = 1` (server-assigned), `is_archived = false`. Blocks
  validated via `validateStarterPackBlocks` (400 with field errors). `409` on
  duplicate slug (Postgres `23505`). **`409` if a non-archived pack already
  exists for that `communityType`** — subsequent packs for an existing type must
  go through "Save as new version", which keeps every non-archived pack for a
  type in one version lineage and makes "latest per type" unambiguous (review
  fix #1). `POST` is therefore for a brand-new type (or re-establishing a type
  whose packs are all archived). Returns `{ pack }` 201.

### `[slug]/route.ts`
- **`PATCH`** — in-place edit. Body (all optional): `displayName`,
  `description`, `blocks`, `isArchived`. **`slug` AND `community_type` are
  immutable** — `community_type` is the apply selection key, so mutating it
  could re-bucket the pack and silently change which pack is "latest" for two
  types at once; recreate instead (review fix #4). **No `version` change**
  (versioning is explicit, via new-version). If `blocks` present, validate.
  `404` if missing; `400` if no editable fields. Returns `{ pack }`. (Unarchive
  is `PATCH { isArchived: false }`.)
- **`DELETE`** — archive: set `is_archived = true` (idempotent). **`409` if it
  is the last non-archived pack for its `community_type`** — archiving it would
  leave new communities of that type with a silently empty site (the apply path
  no-ops when no non-archived pack matches), so the admin must create/unarchive
  a replacement first (review fix #3). Returns `{ archived: true, deleted: false }`.
  No hard delete.

### `[slug]/new-version/route.ts`
- **`POST`** — create the next version from an existing pack. Reads the base
  pack (`404` if missing), sets `newVersion = base.version + 1`, and derives a
  **label** slug `newSlug = ${base.slug without trailing -vN}-v${newVersion}`
  (the slug is a human label; ordering authority is the `version` integer).
  Body may override `displayName` / `description` / `blocks` (defaults: copy
  from the base; blocks are **re-validated even when copied**, in case the base
  predates a schema change). Inserts a new row (`is_archived = false`, same
  `community_type` as the base). The base pack is **left as-is** (not
  auto-archived) — "latest" wins by `version`, and keeping prior versions
  non-archived preserves history and keeps them targetable by
  `reset-to-starter` via explicit slug. `409` if `newSlug` already exists (slug
  is globally unique, even if the existing one is archived — admin unarchives or
  edits that one instead). Returns `{ pack }` 201.

All four route files are platform-admin-gated (`requirePlatformAdmin()` first
line) and JSON-body-parse-guarded.

## 8. Admin UI (`apps/admin/src/app/site-templates/starter-packs/`)

- **`page.tsx`** — server component; `requireAdminPageSession()`; load packs via
  `createAdminTypedClient()`; render `<StarterPacksTable>`. `export const
  dynamic = 'force-dynamic'`. Mirrors `theme-presets/page.tsx`.
- **`StarterPacksTable`** (client, mirrors `ThemePresetsTable`: `useState` +
  `fetch`, `data-testid`-driven, no react-query) — table with a community-type
  filter; per row: display name, slug, type, version, archived pill, block
  count, and actions **Edit** / **Save as new version** / **Archive**
  (**Unarchive** when archived). A **Create pack** affordance opens a blank
  editor.
- **`StarterPackBlocksEditor`** (client) — manages the `blocks` array: add (type
  picker) / remove / move up-down (keyboard-accessible: `<button>`,
  `focus-visible`, `aria-label`). Per entry, content is edited via **compact
  fields for the six simple block types** — `hero`, `text`, `announcements`,
  `documents`, `meetings`, `contact` — whose schemas are tiny (e.g.
  `{limit, timeWindowDays}`, `{showBoard, showManagement}`). These are exactly
  the types the seeded packs use, so the compact path covers real-world editing.
  The remaining types use a **validated JSON `<textarea>`** to bound v1 UI scope
  — not because of an "upload" distinction, but because `image`/`gallery` carry
  storage paths with no admin upload pipeline (see Limitations) and `faq`/
  `amenities` need nested-array sub-editors not worth building in v1. Every
  block, whichever input produced it, is validated server-side via
  `validateStarterPackBlocks`; the editor surfaces returned field errors inline.
- **Nav** — add a `Starter Packs →` link to the site-templates index
  (`apps/admin/src/app/site-templates/page.tsx`), alongside the existing
  Block Registry / Documentation / Theme Presets links.

The admin app uses plain `gray-*` Tailwind (not the `apps/web` design tokens);
match the existing admin visual conventions while keeping interactive controls
keyboard-accessible.

## 9. Testing

- **Shared schema** unit tests — valid + invalid (unknown type, bad content,
  duplicate `blockOrder`, hero not at order 1 / multiple heroes, empty array).
- **Web apply service** — latest-non-archived-per-type selection; all-archived
  → no-op; existing-blocks idempotency unchanged.
- **Admin route tests** (mirror `theme-presets-*-route.test.ts`): GET (list +
  filter), POST (create, dup-slug 409, **same-type-already-exists 409**,
  validation 400), PATCH (edit, 404, no-op 400, archive toggle, blocks
  validation, **community_type is not editable**), new-version (derives
  slug+version, copies+re-validates blocks, 409 on collision, 404 on missing
  base), DELETE (archive, idempotent, **last-non-archived-for-type 409**).
  Auth-failure cases mirror the established admin pattern: mock
  `requirePlatformAdmin` to reject and assert the route **`.rejects.toThrow`**
  (the admin middleware is the real gate; the in-handler guard is
  defense-in-depth) — do NOT assert a 401/403 status from the handler.
- **Admin component tests** (mirror `theme-presets-table.test.tsx`,
  `createRoot`/`act`): table render + filter; edit→save; save-as-new-version;
  archive/unarchive; block add/remove/reorder; inline validation error display.

## 10. Decomposition — 4 sequential PRs

| PR | Scope | Depends on |
|----|-------|-----------|
| **A** | Shared `starterPackBlocksSchema` + `validateStarterPackBlocks` + tests | — |
| **B** | Apply path → latest-non-archived-per-type + test (behavior-preserving today) | — |
| **C** | Admin CRUD routes (GET/POST/PATCH/new-version/DELETE) + route tests | A |
| **D** | Admin UI (table + block editor + page + nav) + component tests | C |

A and B are independent; C consumes A; D consumes C. Each ships full-green CI,
squash-merged. The spec doc lands with PR-A.

## 11. Known limitations (v1)

- **Image/gallery blocks have no upload UI** in the admin pack editor — their
  content references storage paths the admin must already know (edited via the
  JSON area). The seeded packs use none. A future slice could add an admin
  asset-upload pipeline.
- **One pack lineage per `community_type`** — enforced (not merely assumed):
  `POST` 409s if a non-archived pack already exists for the type, so all
  non-archived packs for a type share one version lineage created via
  new-version. This keeps "latest per type = max(version)" unambiguous. A
  genuine multi-family-per-type model (e.g. "standard" vs "luxury" condo packs)
  would need an explicit active-per-type selector — out of scope for v1.
- **No reset-to-starter UI changes** — that flow already takes an explicit slug
  and already rejects archived packs; a future pack-picker UI is out of scope.

## 12. Scope boundary

This is **catalog management** only. Applying a pack to an *existing* community
is the already-shipped `reset-to-starter` flow (unchanged here, beyond
benefiting from versioned slugs + the existing archived-pack guard).

**Downstream observation (out of scope — flag as a separate task):**
`reset-to-starter` selects `community_type` from the pack but never compares it
to the target community, so an admin can reset (e.g.) a condo community with an
apartment pack. This is a pre-existing gap, not introduced here; do **not** fold
a fix into this work.

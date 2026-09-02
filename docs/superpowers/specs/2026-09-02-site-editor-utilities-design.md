# Site editor: duplicate, hide, and photo reuse

**Date:** 2026-09-02
**Gaps closed:** G-06 (media library) and G-10 (section utilities), from the
*Website Editor Feature Gap Audit* (25 July 2026).
**Status:** design approved; implementation plan to follow.

## Why

These are the last two **partials** on the audit ledger — both sit on machinery
that already exists, so they are last-mile work rather than new systems. The
audit's three P0 gaps and all five UX-audit risks already shipped with v3; G-05
and G-07 are now launch blockers 6 and 7 and are scoped separately.

## Scope

**In:** duplicate a section · hide a section from visitors · reuse an
already-placed photo in another section · show storage usage against quota.

**Out, deliberately:**

- **The 30-day page trash.** `deleted_at` on `site_pages` / `site_blocks` is not
  spare capacity — it is the draft/tombstone publish mechanism. Publish step 4
  retires published rows through it, tombstone drafts are soft-deleted through it
  so slots end empty, and every read filters `isNull(deletedAt)`. A trashed page
  would be indistinguishable from one superseded by a publish. A real trash needs
  its own `trashed_at` state, a migration, and exclusion from every publish query.
  Removal already has a time-boxed undo with token matching, which covers the
  actual fear. Dropped as poor value for the risk.
- **Central alt-text editing.** The audit asked for it; it is the wrong model.
  Alt text is contextual to *use* — the same pool photo needs different words in a
  hero than in a gallery — which is both WCAG-correct and what the code already
  does by storing alt on the block. Alt text stays per-block.
- **Deleting photos from the picker.** Deleting an image still referenced by a
  published block breaks the live site, and "is it referenced" is computed rather
  than enforced. Surfacing usage is safe; acting on it is not, absent an index.
- **A `site_assets` index table.** Not needed for anything in scope; see the
  ladder review below.

## Design

### 1. Duplicate a section

A row action in `SectionList`, beside the existing move-up/move-down controls.
It reads the source block's `blockType` and `content` and writes a copy at
`blockOrder + 1` through the **existing** upsert and reorder paths — no new
endpoint. The copy lands as a **draft**, so duplicating never touches the live
site.

Duplicating an image section copies the `imagePath` **reference**, not the bytes.
No upload, no quota change.

### 2. Hide a section from visitors

A `hidden` flag on block content, added once to the shared block-content types in
`packages/shared/src/site-blocks/types.ts` and folded into each block schema —
following the precedent already set by `decorative` and `variant` as optional
fields on `.strict()` objects.

Because `hidden` is **content**, the publish model does not change at all: it
drafts and publishes like any other edit, and the review sheet lists it as a
normal change. This is what makes the feature cheap instead of risky.

- Editor: hidden sections stay visible and editable in the canvas, dimmed, with a
  "Hidden" badge in the section list.
- Public: the block renderer skips `content.hidden === true`.

Two constraints:

- **The hero cannot be hidden.** It is the welcome region, not a section, and a
  site whose first screen is missing reads as broken. Hide applies to the section
  list only.
- **Hiding is a published change, not a local toggle.** It alters what visitors
  see, so it goes through publish like everything else. A hide that took effect
  instantly would be the only thing in this editor that bypasses the draft model.

### 3. Reuse an already-placed photo

A "Choose from your photos" mode inside the existing image entry points —
`AddImageFlow` and the Image/Gallery inspector forms — beside the current upload.

The candidate list is derived **client-side from blocks already loaded**.
`useContentBlocks(communityId)` fetches every block for the community (EditorRoot
merely narrows per page, sharing the query key), and `collectBlockAssetPaths` already
extracts the asset paths a block references. Union those and you have every photo
placed anywhere on the site, with its usage sites — **no endpoint, no storage
listing, no pagination, and no new tenancy surface**.

Selecting a photo sets `imagePath` on the target block through the existing write
path, where `assertPathsScopedToCommunity` already validates it. Alt text is
entered for the new placement, as today.

### 4. Storage meter

In the Site panel: usage against quota. One value and a bar.

The server helpers exist (`getCommunitySiteAssetsUsage`, `assertWithinQuota`,
`applyAssetsUsageDelta`) and are unchanged, but **no route currently returns the
value** — `assetsBytesUsed` is deliberately unreachable through
`PATCH /site/settings`, whose `.strict()` body exists to stop a caller reaching
sibling branding keys. That protection is about the request body; it does not
argue against reading the community's own usage.

So the meter adds two **read-only** fields to the response of the existing
`GET /api/v1/pm/site/settings` — `assetsBytesUsed` and the quota limit — rather
than introducing a route. The PATCH body is untouched, so the mass-assignment
guard is unaffected.

## Ponytail review

Each decision taken down the ladder, stopping at the first applicable rung.

| Decision | Rung | Outcome |
|---|---|---|
| Page trash | 1 — skip it | Removal already has undo; the trash needs a new lifecycle state next to a load-bearing one. **Cut.** |
| Central alt text | 1 — skip it | Wrong model, and per-block alt already exists. **Cut.** |
| Photo candidate list | 2 — reuse | `useContentBlocks` + `collectBlockAssetPaths` already give it. **Route deleted from the design.** |
| Storage usage | 2 — reuse | Helper exists; expose it as two read-only fields on the existing settings GET. No new route. |
| Duplicate | 2 — reuse | Compose the existing upsert + reorder calls. No endpoint. |
| Path tenancy check | 2 — reuse | `assertPathsScopedToCommunity` already guards the write path. |
| Storage listing + pagination | 2 → cut | `cleanup.ts` has the paginated pattern, but nothing in scope needs listing once the candidate list is derived from blocks. **Cut.** |
| `site_assets` table | 1 — skip it | Nothing in scope needs an index. **Cut.** |
| `hidden` flag | 7 — build minimum | No existing mechanism expresses it; one optional field on content, no migration. |

**What the review changed.** The design going in had a `GET` route that listed the
community's storage bucket by prefix, paginating past Supabase's 1000-row `list()`
cap, plus tests for cross-tenant prefix rejection. Rung 2 removed all of it: the
reuse case the audit actually describes — *"reusing the pool photo in the hero and
the gallery"* — is about photos **already placed**, which the client already holds.

The trade is that a photo uploaded and then removed from every section is not
offered for reuse, and — because identifying orphans requires per-file sizes from
a listing — **the meter shows total usage only, not an orphan breakdown**. A PM
near their quota learns that they are near it, not which files to remove. That is
a real limitation of cutting the listing, stated plainly rather than implied away.

Both gaps close together: if orphan reuse or orphan cleanup turns out to matter,
the storage-listing route slots in behind the same picker interface and the same
meter, without rework.

**Non-negotiables held.** Tenancy validation is unchanged and still enforced on
write (`assertPathsScopedToCommunity`); note that `imagePathSchema` validates
shape, not tenancy — `^\d+/…` means any digits pass, which is the gap #987 closed
for blocks after hero had already bound its segment. Data loss: duplicate and hide
are additive, and removal keeps its existing undo. Accessibility: alt text stays
required per placement, hidden sections remain keyboard-reachable in the editor,
and the new row actions inherit `SectionList`'s existing focus and labelling
patterns.

## Testing

- `hidden` round-trips through every block schema (the `.strict()` objects reject
  unknown keys, so each must accept it explicitly).
- The public renderer omits `content.hidden === true`; the editor still renders it.
- The hero exposes no hide affordance.
- Duplicate writes at `order + 1`, as a draft, with content equal to the source.
- Duplicating an image block does not change `assetsBytesUsed`.
- The settings GET returns `assetsBytesUsed` and the quota; the PATCH body still
  rejects them (the mass-assignment guard is unchanged).
- The picker offers exactly the union of paths referenced by the community's
  blocks, and selecting one writes a path that passes
  `assertPathsScopedToCommunity`.
- **Revert-check:** delete the `assertPathsScopedToCommunity` call on the image
  write path and confirm the cross-tenant test reddens *for that reason* — not
  merely "element not found" — while the sibling tests stay green.

## Risks

- **Schema fan-out.** `hidden` touches 11 block schemas. A missed one silently
  cannot be hidden. The round-trip test covers all of them by enumeration rather
  than by sampling.
- **Publish review copy.** Hiding must read as a change in the review sheet
  ("Pool closure — hidden"), not as a silent content edit, or the PM cannot tell
  what they are about to publish.
- **Picker staleness.** The candidate list is derived from React Query state; a
  photo added in another tab appears after the existing invalidation, same as any
  other block change. No new cache to reason about.

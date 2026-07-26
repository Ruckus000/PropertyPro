# Website Editor v3 — gap analysis & phased roadmap

> **What this is.** A design review of the v3 redesign of the PM-facing Website editor,
> measured against what the product actually has today. No code was written. It answers
> three questions: what does v3 ask for, what already exists, and in what order could the
> rest be built.
>
> **Companions.** `website-editor-spec.md` (today's implementation, exhaustive),
> `website-editor-design-system.md` (the closed token/component vocabulary),
> `website-editor-mockup.html` (today's design rendered), and
> `website-editor-v3-layout-options.html` (the shell-integration decision aid).
>
> **Status:** all ten open decisions were settled on 2026-07-25 — see §9. The layout is
> **Option B** (full-bleed, no app shell) with the collapsed `NavRail` reused inside the
> editor. Everything below reflects those decisions.
>
> **Source of v3.** Claude Design project `PropertyPro Design System`
> (`da1d4969-74dd-47ed-89dc-b64070d178de`), directory `website-editor-redesign/`:
> `Website Editor v3.html` + `editor-v3.{jsx,css}`, `v3-base.jsx`, `v3-kit.jsx`,
> `v3-forms.jsx`, `v3-site.jsx`, `v3-onboarding.jsx`, `v3-publish.jsx`, `tweaks-panel.jsx`,
> `image-slot.js`. Field-level form detail lives in `v3-forms.jsx` and `v3-onboarding.jsx`,
> which this document summarises rather than reproduces.

---

## 1. The shape of the gap, in one paragraph

Today's editor is a **stacked form column over a single-page, atomically-published block
list**. v3 is a **canvas editor over a multi-page site with a typed change model**. Almost
every v3 feature that looks like UI polish — the review sheet, the per-change revert, the
"3 changes waiting" counter, the publish history, the draft badges on the canvas — is
downstream of one thing the product does not have: a **diff between the draft and the last
published snapshot**. Today the draft layer is a set of `is_draft` rows and publishing
promotes all of them; there is no representation of "what changed", so there is nothing to
list, scope, attribute, or revert. That single missing concept is the spine of the roadmap
in §7, and it is worth more than any individual feature on the list.

---

## 2. v3 capability inventory

Every capability in the design, with the module it comes from.

| # | Capability | v3 module |
|---|---|---|
| 1 | Full-viewport three-column editor (tool panel · canvas · inspector) | `editor-v3.jsx` |
| 2 | Six labelled tool tabs; tool panel resizable 280–560 px, drag + arrow keys, persisted | `editor-v3.jsx` |
| 3 | Canvas WYSIWYG: click to select, hover/focus float controls, move up/down, remove, `Alt+↑/↓` | `editor-v3.jsx`, `editor-v3.css` |
| 4 | Section list with drag reorder **and** keyboard parity (grip button + arrow keys), drop indicators | `editor-v3.jsx` |
| 5 | Between-section inserter on the canvas | `editor-v3.css` (`.ins`) |
| 6 | Inspector: docked at ≥1280 px, overlay sheet below, Esc to close | `editor-v3.jsx` |
| 7 | Autosave with a real status line (`Saving…` → `Draft saved · 3:42 PM`) | `v3-kit.jsx` (`StatusLine`) |
| 8 | Typed change model — keys `hero`, `style`, `footer`, `site`, `page:<id>`, `pageorder`, `block:<id>`, `order:<page>` | `v3-kit.jsx` (`diffSite`) |
| 9 | Selective publish: tick/untick changes; child changes gated on their parent page | `v3-kit.jsx` (`applySel`), `v3-publish.jsx` |
| 10 | Publish-blocking validation per change, with a "Fix this" deep link into the editor | `v3-kit.jsx` (`blockIssues`, `heroIssues`, `stylingIssues`, `pageIssues`, `siteIssues`) |
| 11 | WCAG AA contrast gate on custom colours (4.5:1, computed) | `v3-kit.jsx` (`ratio`, `lum`) |
| 12 | Publish failure state + a **persistent receipt** instead of a vanishing toast | `v3-publish.jsx` (`Receipt`) |
| 13 | One-step revert of the last publish (`prevPub`) | `v3-kit.jsx`, `v3-publish.jsx` |
| 14 | Per-change revert — pull one entity back from the published snapshot | `v3-kit.jsx` (`revertOne`) |
| 15 | Publish history log — when, who, how many, which labels (Pro-gated) | `v3-publish.jsx` (`HistoryGroup`) |
| 16 | **Multi-page sites** — name, slug, nav visibility, order, redirect-on-rename | `v3-kit.jsx` reducer, `v3-site.jsx` |
| 17 | Site nav in the preview, with a burger menu at narrow widths | `v3-site.jsx` |
| 18 | **Urgent notice** — banner on every page, publishes alone and immediately, optional expiry | `v3-publish.jsx`, `v3-site.jsx` |
| 19 | Site settings entity — title, description, language, favicon, search indexing + SERP preview | `v3-publish.jsx` (`SitePanel3`) |
| 20 | Footer entity — association name, note, opt-in statutory line with a counsel warning | `v3-publish.jsx` |
| 21 | Hero photo **array** + accessible carousel (pause, dots, live region, reduced-motion) | `v3-site.jsx` (`HeroCarousel3`) |
| 22 | Hero layout styles (`centered` / `split`) | `v3-site.jsx` |
| 23 | New block type: **`payments`** ("Pay dues" → resident portal) | `v3-base.jsx` |
| 24 | Block layout variants — text `standard/split`, image `full/inset`, gallery columns, amenities `grid/list` | `v3-base.jsx`, `v3-site.jsx` |
| 25 | Author-supplied empty-state text per data-driven block (`emptyText`) | `v3-base.jsx`, `v3-site.jsx` |
| 26 | Undo toasts on every destructive action; dismissible, action-bearing | `v3-kit.jsx` |
| 27 | Confirm dialogs with tone + optional type-to-confirm, focus trap and restore | `v3-kit.jsx` (`AlertDialog`, `useTrap`) |
| 28 | Preview dialog — device widths, page switcher, "open draft in a new tab" | `editor-v3.jsx` (`PreviewDialog`) |
| 29 | Guided setup **inside** the editor, resumable after interruption | `editor-v3.jsx`, `v3-onboarding.jsx` |
| 30 | Help tab — "How do I…" disclosure list + support address | `editor-v3.jsx` |
| 31 | Phone gate below 768 px, with the urgent-notice fast path still available | `editor-v3.{jsx,css}` |
| 32 | Change attribution — "Edited by Dana Reyes" on a colleague's drafts | `v3-kit.jsx` (`authors`) |
| 33 | Discard-all with an accurate count and a confirm | `v3-kit.jsx` (`discardAll`) |
| 34 | Pinnable, hover-expanding nav rail | `editor-v3.jsx` (`Rail`) — **out of scope, see §6** |
| 35 | Single focus system; `:focus-visible` never suppressed; reduced-motion honoured | `editor-v3.css` |

---

## 3. Capability × current state

`exists` = shipped and equivalent · `partial` = something related exists but not what v3
asks for · `missing` = no counterpart.

| # | Capability | State | Where it stands today |
|---|---|---|---|
| 1–6 | Canvas editor shell, tool tabs, inspector, drag reorder | **missing** | `page.tsx` renders a stacked column; `ContentSectionsList.tsx` reorders with up/down chevrons via `POST /api/v1/pm/site/blocks/reorder` |
| 7 | Autosave + status line | **partial** | Each form saves on submit and shows its own "Saving…" — inconsistently (`spec §8.3`). No page-level status |
| 8 | Typed change model | **missing** | The draft layer is `site_blocks.is_draft` rows. No diff, no change keys, no labels |
| 9 | Selective publish | **missing** | `publishCommunitySite()` promotes **every** live draft row |
| 10 | Publish-blocking validation | **partial** | Zod schemas in `packages/shared/src/site-blocks/*` reject bad content **at write time**. Nothing blocks publish, and nothing aggregates issues |
| 11 | Contrast gate | **missing** | `CustomStylingForm.tsx` takes colours with no contrast check |
| 12 | Failure state + receipt | **partial** | `PublishBar.tsx` surfaces errors via a `sonner` toast; nothing persists |
| 13–14 | Revert (one-step, per-change) | **missing** | No previous-published state is retained. `discardSiteDrafts()` throws away drafts, which is the opposite operation |
| 15 | Publish history | **missing** | `communities.site_published_at` holds one timestamp. `compliance_audit_log` records the act, not the content |
| 16–17 | Multi-page + site nav | **missing** | `site_blocks` has `block_order` and no page dimension; `app/public-site/page.tsx` is a single route |
| 18 | Urgent notice | **missing** | Closest relatives are announcements and `emergency_broadcasts`, neither of which reaches the public site |
| 19 | Site settings entity | **missing** | Title/description/indexing are not editable; metadata is derived |
| 20 | Footer entity | **partial** | `PublicSiteFooter.tsx` renders a footer; nothing about it is PM-editable |
| 21–22 | Hero photos + carousel, layout styles | **partial** | `heroBlockSchema` has exactly one `heroImagePath` + `heroImageAlt`, and the editor cannot even set it (`spec §8.4`) |
| 23 | `payments` block | **missing** | Not in `BLOCK_TYPES`, not in the `site_blocks_block_type_check` constraint |
| 24 | Block layout variants | **missing** | No `layout` field on the text/image/amenities schemas |
| 25 | Per-block empty text | **missing** | Public renderers hard-code their empty copy |
| 26 | Undo toasts | **partial** | `sonner` is mounted (`app/layout.tsx`) and already used by `ContentSectionsList`/`PublishBar` — but as notifications, with no undo action |
| 27 | Confirm dialogs, focus trap | **exists** | `components/ui/alert-dialog.tsx` + `dialog.tsx` (Radix) already trap and restore focus. v3's hand-rolled `useTrap` should be discarded |
| 28 | Preview | **partial** | "Preview Draft" opens the public site with `?preview=true` in a new tab. No in-editor device preview |
| 29 | Guided setup, resumable | **partial** | A full wizard exists at `/pm/onboarding/website` with `components/pm/onboarding-wizard/*`; progress persists in `communities.site_onboarding_progress` and `onboarding_wizard_state`. It is a **separate route**, not in-editor |
| 30 | Help tab | **partial** | The help centre (MDX, `content/help/`) and `HelpWidget` exist app-wide; no editor-local "How do I…" |
| 31 | Phone gate | **missing** | The page renders at any width and degrades |
| 32 | Change attribution | **missing** | No per-row author on `site_blocks` |
| 33 | Discard-all | **exists** | `DELETE /api/v1/pm/site/drafts` → `discardSiteDrafts()`, wired to `PublishBar` |
| 35 | Focus/motion discipline | **exists** | Enforced by `.claude/rules/design.md` and the token layer |

**Already shipped and worth keeping** (v3 does not regress any of these): the nine block
types with Zod-validated content, `tombstone` staged deletion (migration 0026), the
publish transaction's row lock + `expectedPublishedAt` optimistic-concurrency token, the
three site layouts (`Boulevard`/`Sable`/`Tidewater`), theme presets, starter packs,
portfolio templates, custom domain with DNS verification, and the four Pro gates.

---

## 4. Backend work, by capability

### 4.1 Publish history + revert — *prioritised*

The self-contained one. It adds a table and two service functions, changes no existing
column, and needs no change to the block model.

**Schema.** New tenant table `site_publish_snapshots`:

| Column | Notes |
|---|---|
| `id` | `bigserial` PK |
| `community_id` | `bigint` NOT NULL → `communities.id` `ON DELETE CASCADE` |
| `published_at` | the publish's timestamp — matches the `published_at` stamped on the promoted rows |
| `published_by` | `uuid` actor |
| `snapshot` | `jsonb` — the full published set as of this publish (blocks + branding +, later, pages/site/footer) |
| `change_count` / `kept_count` | for the history line "8 changes by Jordan Rivera · 2 kept as draft" |
| `labels` | `jsonb` string array — the human labels from `diffSite` |
| `kind` | `'publish' \| 'revert' \| 'urgent_notice'` — v3's history mixes all three |
| `created_at`, `deleted_at` | standard |

Standard tenant-table obligations apply: RLS policies **in the migration**, the
`enforce_community_scope` write trigger, and bumping
`RLS_EXPECTED_TENANT_TABLE_COUNT` in `packages/db/src/schema/rls-config.ts`
(currently 62). Next free migration number is **0034** — re-check
`packages/db/migrations/` before writing, since that is a shared counter.

**Capture.** Inside the existing `publishCommunitySite()` transaction
(`lib/services/site-blocks-service.ts:224`), after promotion and before commit, read back
the resulting published set and insert one snapshot row. Same transaction, so a snapshot
can never disagree with what went live.

**Restore.** `POST /api/v1/pm/site/publish/revert` → a new
`revertToSnapshot({ communityId, snapshotId, actorUserId })`, in one transaction:
lock the community row, soft-delete every current published row, insert the snapshot's
rows as published with a **fresh** `published_at`, and write a `kind: 'revert'` snapshot
so the history stays append-only.

Three details that are easy to get wrong:

- **The partial unique index.** `site_blocks_community_order_draft_partial` is
  `(community_id, block_order, is_draft) WHERE deleted_at IS NULL`. Delete-then-insert
  inside one transaction is fine; insert-then-delete is not.
- **Tombstones never enter a snapshot.** They are draft rows
  (`TOMBSTONE_BLOCK_TYPE`, migration 0026), and a snapshot captures the *published* set
  only. So a revert cannot resurrect a staged deletion — correct, and worth stating in the
  UI copy.
- **The optimistic token must advance.** `expectedPublishedAt` is derived from
  `MAX(published_at)` across published rows. Because the restore stamps a fresh
  timestamp, an editor holding a stale token gets the existing `ConflictError` rather than
  silently clobbering the revert. Free correctness — do not bypass it.

**Retention.** One jsonb snapshot per publish grows without bound. Prune to the most
recent N (30 is generous for a "revert one step" product) or 12 months, whichever is
larger, in the daily lifecycle cron — `app/api/v1/internal/account-lifecycle/route.ts`
already calls `cleanupSoftDeletedSiteBlocks()` from there, so the hook exists.

**Scope of the UI it unlocks:** v3 items 12, 13, 15. Item 14 (per-change revert) needs the
change model from Phase 4, not this.

**Migration safety:** pure expand (new table). Safe to apply to production **before** the
code ships, per the repo's expand-before-code discipline.

### 4.2 Multi-page sites — *prioritised*

The largest item, and the only one that changes the **published** site's URL surface
rather than just the editor.

**v3's model** (`v3-kit.jsx` reducer): `pages: [{ id, name, slug, inNav, system, redirect }]`
with `blocks` keyed by page id; `home` is a system page pinned at `/`. Pages are
*draftable* — `page:<id>` and `pageorder` are first-class entries in the change list, and
`pageIssues()` validates name/slug uniqueness at publish time.

**Schema.**

1. New `site_pages` table: `community_id`, `name`, `slug`, `in_nav`, `sort_order`,
   `is_home`, `redirect_from` (for renamed slugs), plus `is_draft` + `published_at`
   mirroring `site_blocks` so pages participate in the same draft/publish cycle. Same RLS
   + trigger + count-bump obligations as above.
2. `site_blocks.page_id` → `site_pages.id`.
3. **The index has to change.** `site_blocks_community_order_draft_partial` is
   `(community_id, block_order, is_draft) WHERE deleted_at IS NULL`. With pages, ordering
   is per-page, so it must become `(community_id, page_id, block_order, is_draft)`. Every
   existing row needs `page_id` backfilled to the community's home page first.

**Service layer.** `reorderSiteBlock`, `removeSiteBlock`, `upsertPublishedBlock`,
`discardSiteDrafts` and `publishCommunitySite` all key on `block_order` alone today. Each
needs a page dimension. `publishCommunitySite`'s "which `block_order`s have a live draft"
step (`:275`) becomes "which `(page_id, block_order)` pairs".

**Public site.** `app/public-site/page.tsx` is a single route. Multi-page needs a
`[[...slug]]` catch-all, nav in `PublicSiteHeader` driven by `in_nav` + `sort_order`, a
404 for unknown slugs, and redirect handling for renamed pages — v3 already surfaces the
consequence in its change list ("address changed from /documents — old links will break"
vs "(redirect kept)"), so the product decision is made; it just has to be honoured
server-side. Sitemap and `robots` behaviour follow from §4.4's indexing flag.

**Migration ordering** (manual applies, expand-before-code):

| Step | When |
|---|---|
| 0034 (or next free): create `site_pages`, add nullable `site_blocks.page_id`, backfill to home, create the new 4-column partial index | **before** the code ships |
| ship the code that reads/writes `page_id` | — |
| next migration: drop the old 3-column index, set `page_id` NOT NULL | **after** the new code is live |

Two migrations, two deploys. Doing it in one is how the live site breaks.

**Risk.** Highest of the four. It touches the public site, the tenant's URL surface, and
the index that guarantees draft/published ordering. Sequence it after publish history, not
before — history has no dependency on it and de-risks everything else by making publishes
reversible.

### 4.3 Selective publish — *not prioritised, sized honestly*

Depends entirely on the change model (Phase 4). Once `diffSite` exists client-side, the
publish route takes a list of change keys instead of "promote everything".

The awkward part is ordering. Today publish promotes drafts by `block_order` slot, so a
partially-promoted reorder would leave the published order incoherent. v3 solves this by
making `order:<page>` **its own change**, separate from the blocks it reorders — the review
sheet's own copy says "Section order publishes with the page it belongs to". Any
implementation has to adopt that framing or the feature produces broken published states.

Rough size: change-model work (shared with items 8, 10, 12–15, 32) plus a rewrite of
`publishCommunitySite`'s promotion step. Not a standalone project.

### 4.4 Urgent notice — *not prioritised, sized honestly*

Smallest of the four and the most self-contained user-facing win.

- Storage: `communities.urgent_notice jsonb` — `{ text, until, at, by }` — or a small table
  if per-notice history is wanted (v3 logs each post/removal into publish history, so a
  `kind: 'urgent_notice'` snapshot row covers it without a new table).
- Write path: its own endpoint that skips the draft layer entirely. v3 is explicit — it
  "publishes alone, immediately", and none of the other drafts go with it.
- Render: a `role="alert"` band above the header in the public-site layout.
- Expiry: compare `until` at render time (no scheduler needed for correctness), optionally
  swept by the existing internal cron pattern (`/api/v1/internal/account-lifecycle`) so the
  editor's own state agrees.
- Guardrail worth keeping from v3: the notice is disabled until the site has been published
  at all — "there's nowhere to show a notice".

### 4.5 Everything else that touches the backend

| Item | Work |
|---|---|
| Site settings (19) | New fields (title/description/language/favicon/indexing) in the branding jsonb or their own columns; consumed by the public-site `metadata` export and `robots` |
| Footer (20) | Editable fields in branding; `PublicSiteFooter` reads them. The statutory line must stay **opt-in** with the counsel warning — see §5 |
| Hero photos (21) | `heroBlockSchema` gains a `photos: [{path, alt, decorative}]` array; the single `heroImagePath`/`heroImageAlt` pair becomes the migration source. Existing rows are content, not columns, so this is a jsonb shape change with a read-time upgrade, not a DDL migration |
| `payments` block (23) | New Zod schema + `BLOCK_TYPES` entry + **a migration to extend `site_blocks_block_type_check`**. Easy to forget: the type list is a CHECK constraint, not an enum |
| Block layout variants (24), empty text (25) | Additive optional fields on existing block schemas — no migration |
| Attribution (32) | `site_blocks.updated_by uuid` + the same on `site_pages` |

---

## 5. Compliance note on the footer's statutory line

v3's footer offers an opt-in "records-compliance line"
(`Records maintained under Fla. Stat. §718.111(12)(g)`) with a warning that the association
is responsible for the statement. Keep both the opt-in default and the warning. PropertyPro
presents factual data and does not assess compliance adequacy
(`.claude/rules/florida-compliance.md`); a footer line that a community could read as the
platform certifying its statutory compliance is exactly the claim to avoid. The v3 copy
already gets this right — do not "clean it up".

---

## 6. Design-system translation

The decision is to rebuild with repo primitives rather than port `editor-v3.css`. Most of
v3's vocabulary already exists.

| v3 class | Repo replacement |
|---|---|
| `.btn`, `.btn-primary/-outline/-ghost/-danger`, `.btn-sm` | `components/ui/button.tsx` — `default` / `outline` / `ghost` / `destructive`, `size="sm"` |
| `.icon-square` | `Button variant="ghost" size="icon"`. **Note the divergence:** v3 uses 32 px, the repo standard is 36 px (`.claude/rules/design.md`). Use 36 |
| `.pill`, `.pill-success/-warning/-danger/-accent/-muted` | `components/ui/badge.tsx`; for anything status-bearing, `components/shared/status-badge.tsx` + `getStatusConfig()` from `packages/ui/src/constants/status.ts` |
| `.pro-badge` | The existing `PlanBadge` (`packages/ui/src/components/PlanBadge`) |
| `.callout`, `.callout-info/-warning/-danger` | `components/shared/alert-banner.tsx` |
| `.callout-upgrade` | No equivalent — either a new `upgrade` tone on AlertBanner or compose PlanBadge + AlertBanner |
| `.card` | `components/ui/card.tsx` |
| `.field`, `.label`, `.input`, `.select`, `.textarea`, `.hint`, `.err`, `.check` | `components/ui/{input,textarea,select,label,checkbox}.tsx` |
| `.dialog`, `.scrim`, `.dg-head/-body/-foot`, **`useTrap`** | `components/ui/dialog.tsx` / `alert-dialog.tsx` (Radix). **Delete `useTrap`** — Radix already traps, restores focus, and inerts the background |
| `.overlay-panel` | `components/ui/sheet.tsx`, or the existing `components/shared/slide-over-panel.tsx` |
| `.toasts`, `.toast`, `.ta`, `.tx` | `sonner` — already a dependency, `<Toaster/>` already mounted in `app/layout.tsx`, already used by `PublishBar`/`ContentSectionsList`. v3's undo action maps to sonner's `action` prop |
| `.tool-tab`, `.seg` | `components/ui/tabs.tsx`; the device-width segmented control can be Tabs or a small `role="group"` of toggle buttons |
| `.empty` | `components/shared/empty-state.tsx` + configs from `lib/constants/empty-states.ts` |
| `.dns`, `.dns-wrap` | `components/ui/table.tsx` |
| `.add-grid`, `.add-tile` | Compose Card + Button; no new primitive |
| `.brand-mark`, `.avatar`, `.nav-item`, `.nav-sec`, `Rail()` | **Discard.** These reimplement `AppSidebar` / `NavRail` / `SidebarTenantSwitcher` |

**Genuinely new components** (no repo equivalent — this is the real build):
`.sec-shell` + `.gutter` (canvas section frame with its hover/focus-revealed rail),
`.canvas-sec` selection outline, `.float-ctrl` (floating per-section controls),
`.ins` (between-section inserter), `.row` / `.row-list` (draggable section row with
drop indicators), `.statusline` + `.dot-pulse` (autosave indicator), and the resizable
panel separator.

**What would trip `guard:design-tokens` if ported verbatim:**

- Raw hex and functional colour literals: `.btn-danger{color:#fff}`, `.toast{color:#fff}`,
  `rgba(255,255,255,.35)` on the toast action, the `rgba(28,25,23,.45)` scrim fallback, and
  the `var(--status-danger-bg,#fef2f2)` style fallbacks sprinkled through `v3-publish.jsx`
  and `v3-site.jsx`. Fallbacks are unnecessary in the app — the tokens are always defined,
  and `guard:token-coverage` proves it.
- v3 does **not** use slash-opacity on semantic tokens anywhere — it reaches for solid
  `-subtle`/`-bg` tokens. That is the correct pattern and it incidentally fixes rough edge
  §8.1 (see §7 below). Keep it.
- `#root{height:100dvh}` and `body{overflow:hidden}` are mockup-global and cannot ship as
  written; they become the layout decision in the companion HTML.

---

## 7. Known rough edges — what v3 fixes

From `website-editor-spec.md` §8:

| # | Rough edge | v3 |
|---|---|---|
| 1 | Slash-opacity on `--brand-accent` renders as nothing | **Fixed** — v3 uses solid `--interactive-subtle` throughout |
| 2 | Tech-blue colour-picker defaults, off-brand | **Fixed** — `DEF_STYLING.p = #C2533A`, the coral brand primary |
| 3 | "Saving..." vs "Saving…" inconsistency | **Fixed** — one `StatusLine` for the whole editor |
| 4 | Hero image not editable in the editor | **Fixed, and expanded** — a photo array with alt text and a carousel |
| 5 | Section headings owned inconsistently | **Fixed** — one panel header component |
| 6 | Block cards titled `#3 — documents` | **Fixed** — `BLOCK_META` gives every type a label, icon and a content summary line |
| 7 | Two `DomainState` definitions can drift | **Not addressed** — still worth consolidating into `packages/shared` |
| 8 | Domain records empty on first load | **Not addressed** — the pre-fetch idea stands on its own |

---

## 8. Phased roadmap

Each phase is PR-sized and ships something. Phases 1–5 need no migration.

| Phase | What | Depends on | Ships to users | Risk |
|---|---|---|---|---|
| **0** | **Editor route group** (Option B). A shell-less layout that re-establishes what `AppShell` provided: auth, community resolution, feature gating, the lapsed-community route gate — and **`AppQueryProvider`**, which is mounted per route-group layout, not at root. Renders the collapsed `NavRail` plus the editor's own top bar. Feature flag added, old editor left routable | — | nothing | Medium — it re-implements shell responsibilities rather than editing a shared file |
| **1** | Editor shell: three-column layout, six tool tabs, resizable panel, phone gate. Existing forms rendered inside the new panels, unchanged | 0 | new chrome behind the flag, same capabilities | Low |
| **2** | Canvas: render the real public-site blocks (`components/public-site/blocks/*`) in the editor, section selection, float controls, `Alt+↑/↓`, between-section inserter, drag reorder with keyboard parity, inspector | 1 | the actual redesign | Medium — see §9 on renderer reuse |
| **3** | Autosave + status line; undo toasts on destructive actions via `sonner`; confirm dialogs on Radix; in-editor preview dialog | 1 | "saved" becomes trustworthy | Low |
| **4** | **Change model.** `diffSite` equivalent over draft vs published; the "N changes waiting" counter, Draft badges on the canvas, the Site panel's named change list, publish-time validation with "Fix this" deep links, contrast gate | 2, 3 | the spine of everything after | Medium |
| **5** | Review-and-publish sheet — grouped, labelled, with blocking issues. **Atomic publish for now** (every listed change goes); failure state and persistent receipt | 4 | real confidence before publishing | Low |
| **6** | **Publish history + revert** (§4.1). Migration 0034: `site_publish_snapshots`. One-step revert + per-change revert on every plan; the history log Pro-gated | 4, 5 | publishing becomes reversible | Medium |
| **7** | Selective publish (§4.3) — the tick boxes go live; `order:<page>` as its own change | 4, 6 | drafts can be held back | Medium |
| **8** | **Multi-page** (§4.2). Two migrations, two deploys. Pages manager, per-page blocks, public-site catch-all route, nav, redirects | 6, 7 | more than one page | **High** |
| **9** | Urgent notice (§4.4) + the phone fast path | 1 | emergency comms on the public site | Low |
| **10** | Site settings + footer entities, SERP preview, indexing flag | 5 | SEO and footer control | Low |
| **11** | Content additions: hero photo array + carousel, `payments` block (CHECK-constraint migration), block layout variants, per-block empty text | 2 | richer pages | Low each |
| **12** | Guided setup presentation moved in-editor, still persisting to `site_onboarding_progress` / `onboarding_wizard_state`; Help tab | 1 | setup survives interruption **and** a device change | Low |
| **13** | Flag flip and retirement of the stacked-form editor | all | one editor | Low |

Two things worth saying about the order. **Phase 4 is the pivot** — six later capabilities
are all views of the same change model, and building any of them before it means building
them twice. And **Phase 6 before Phase 8** is deliberate: multi-page is the riskiest change
to the published site, and it is much less frightening once a bad publish can be reverted
in one click.

Phases 9–12 are independent of the 4→8 spine and can be interleaved by whoever is free.

---

## 9. Decisions taken

Settled 2026-07-25. Where a decision went against the recommendation, the accepted
trade-off is recorded rather than argued again.

| # | Decision | Consequence for the build |
|---|---|---|
| 1 | **Layout: Option B** — full-bleed, no app shell | Recommendation had been A. Accepted trade-off: the editor gives up the shell's sidebar, command palette, breadcrumb trail and banner strip, and a new route group must re-establish auth, community resolution, feature gating and **`AppQueryProvider`** (mounted per route-group layout, not at root — React Query hooks 500 without it). Buys ~72 px of width and ~93 px of height over A, and avoids editing `AppShell`, which every authenticated page shares |
| 2 | **Nav chrome: reuse the collapsed `NavRail`** | Full app navigation returns inside the editor at its 72 px width, single-sourced with the sidebar's own gating and labels. v3's hand-rolled `Rail()` is discarded. Net width vs Option A is therefore roughly a wash — B's real win is the 93 px of vertical chrome and not touching the shell |
| 3 | **Canvas: reuse `components/public-site/blocks/*`** | Selection chrome wraps *around* each block, as v3's `wrapSection` does. What you see is literally what publishes. New standing constraint: the ten renderers must stay hook-free and prop-driven so they work inside a client tree — worth a comment in `blocks/registry.ts` so a future edit doesn't break the canvas silently |
| 4 | **Billing: route gate + compact status strip** | Reuse the existing lapsed-community lockout (#835 / #837) so a lapsed community never reaches the editor. States that still allow entry — trial ending, free access expiring — get a condensed strip in the editor's own top bar rather than the full shell banners |
| 5 | **Publish history: split gate** | One-step revert on **every** plan; the full audit log Professional-only. Needs one new flag in `packages/shared/src/features` (`hasSitePublishHistory` or similar) covering the log, not the revert. Rationale: an Essentials PM who breaks their public site must be able to undo it |
| 6 | **Guided setup: presentation in-editor, progress server-side** | The wizard's steps render inside the editor; progress keeps persisting to `communities.site_onboarding_progress` + `onboarding_wizard_state`. v3's `WKEY` `localStorage` resume is **not** ported — it would silently restart setup on another device, which defeats the point |
| 7 | **Rollout: feature-flagged, old editor retained** | Every phase lands on `main` behind a flag; the stacked-form editor stays routable until Phase 13. Both editors run against the same API for the duration — the write routes are shared, so no API forking |
| 8 | **Phone gate: as designed** | Below 768 px, show the gate — view the public site, or post an urgent notice. No mobile editing fallback to maintain |
| 9 | **Content additions: all four in scope** | Hero photo array + carousel; block layout variants + per-block empty text; the `payments` block (**needs a migration** — block types are a CHECK constraint, not an enum); site settings + footer entities. Phases 10 and 11 are both confirmed scope, not optional |
| 10 | **Multi-page sequenced after publish history** | Unchanged from §8. Multi-page is the only change that touches the published site's URL surface, and it is far less risky once a bad publish is one click from being undone |

### Still to decide, later

Not blocking Phase 0, but they will come up:

- **Redirect retention on page rename.** v3 surfaces the consequence in its change list
  ("old links will break" vs "redirect kept") but leaves the default unstated. Decide when
  Phase 8 is specified.
- **Snapshot retention window.** §4.1 proposes 30 publishes or 12 months. Confirm before
  Phase 6 ships, since it determines how far back "restore" can reach.
- **`payments` block target.** Whether the button deep-links to the resident portal's
  payment page or to a community-specific URL the PM supplies.

---

## 10. What this review did not cover

- Field-level form detail in `v3-forms.jsx` and `v3-onboarding.jsx` — read those before
  building Phases 2, 11 and 12.
- `image-slot.js`, the mockup's drag-and-drop photo placeholder. The real implementation is
  `POST /api/v1/site/uploads` + `/api/v1/site/images`, which already exists.
- Any estimate in hours or story points. The phase table orders and sizes relative risk;
  it does not schedule.

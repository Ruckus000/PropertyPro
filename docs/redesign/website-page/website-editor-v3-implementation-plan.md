# Website Editor v3 — implementation plan

> **Why this exists.** `website-editor-v3-gap-analysis.md` is a design review: it establishes
> *what* to build, in what order, and why. It cannot be executed from — it names no files,
> no tests, and no definition of done. This document is the other half. Every phase below
> states the files it touches, the tests that must exist before it is considered finished,
> the exact command that proves it, and how to undo it.
>
> Read the gap analysis first for rationale; this document does not repeat it.

---

## 1. Can all phases run without stopping?

The honest answer is **no, and the blockers are repo policy rather than preference.**
Ten of the twelve phases are continuous. Three points cannot be automated away:

| Gate | Where | Why it is a hard stop |
|---|---|---|
| **G1** | Phase 6, before the code merges | Migration `site_publish_snapshots` must be applied to production **manually** via Supabase MCP `apply_migration`, then verified against `information_schema`. `CLAUDE.md` and `.claude/rules/migration-safety.md` make this the single deliberate apply path — CI does not migrate |
| **G2** | Phase 11a, before the code merges | The multi-page **expand** migration (new tables, nullable `page_id`, backfill, new index) must be applied before any code reads `page_id` |
| **G3** | Phase 11c, after 11b is **live in production** | The **contract** migration (drop the old index, `SET NOT NULL`) can only run once the old code that depends on the 3-column index is gone. Applying it early breaks the live public site. This gate is a *deploy wait*, not just an apply |

A fourth, softer one: `RLS_EXPECTED_TENANT_TABLE_COUNT` in
`packages/db/src/schema/rls-config.ts` must be **re-derived at merge time**, not
authored ahead. The file says so itself — parallel PRs each bump `+1` and git merges both
silently, so the second PR to merge has to set the true total.

**Recommended human checkpoints beyond the gates:** after **Phase 4** — five later
capabilities are views of the change model, so if its shape is wrong everything from
Phase 5 onward is built twice — and before **Phase 11a**, the middleware reorder.

Everything else — Phases 0–10 and 12 — can run continuously provided each phase's
verification gate passes before the next begins.

---

## 2. Test strategy

### 2.1 The layers, and what each is for

| Layer | Location | Runs | Use it for |
|---|---|---|---|
| Unit | `apps/web/__tests__/lib/`, `__tests__/services/` | `pnpm test` | Pure logic: the diff engine, validation, slug rules, contrast maths |
| Component | `apps/web/__tests__/components/**` | `pnpm test` | Rendering, interaction, keyboard behaviour, ARIA |
| Route | `apps/web/__tests__/api/**` | `pnpm test` | Handler authz, validation, response shape — with the DB mocked |
| **Contract auto-suite** | `apps/web/__tests__/api-contract-suite/` | `pnpm test` | **Free.** See §2.2 |
| Integration | `apps/web/__tests__/integration/**` | `pnpm test:integration:local` | Real Postgres: transactions, RLS, concurrency, migrations |
| RLS | `packages/db/__tests__/rls-policies.integration.test.ts`, `rls-config.test.ts` | integration | Every new tenant table's policies |
| E2E | `apps/web/e2e/*.spec.ts` | `pnpm test:e2e` | The flows that cross the whole stack: edit → publish → public site |
| Accessibility | `apps/web/__tests__/accessibility/axe-audit.test.tsx` | `pnpm test` | Axe violations on new surfaces |
| Guards | `scripts/verify-*.ts` | `pnpm lint` | Architectural invariants |
| Performance | `scripts/perf-check.ts` | `pnpm perf:check` | Route JS budget |

### 2.2 What is free, and must not be circumvented

`apps/web/__tests__/api-contract-suite/contract-registry.ts` discovers **every**
`src/app/api/**/contract.ts` by `import.meta.glob`. Any new route that ships a contract is
automatically subjected to:

- **`contract-suite.test.ts`** — structural integrity, and flags `z.unknown()` responses.
- **`rbac-check.ts`** — the `permission` label must name a real `(resource, action)` from
  the RBAC matrix, or be in `KNOWN_NON_MATRIX_PERMISSIONS`. **Adding a new entry to that
  set is a deliberate act** — if a new site route needs one, justify it in the PR rather
  than appending quietly.
- **`malformed-input.ts`** — permissive input schemas are surfaced.

Consequence for this program: **every new route ships a `contract.ts`.** It is the cheapest
security coverage available and it is already paid for.

### 2.3 Rules specific to this codebase — learned the hard way

These are not general advice; each corresponds to a real failure in this repo.

1. **Mock `@propertypro/db` completely.** When a route starts importing a new export
   (`paginate`, a new table), *every* existing `vi.mock('@propertypro/db', …)` factory in
   the touched test files needs that export added, or module load throws and every test in
   the file fails — **in CI only**. Before adding an import to a route, grep
   `vi\.mock\(['"]@propertypro/db['"]` across `apps/web/__tests__/`.
2. **Never let a guard read the DB.** A route guard that queries makes route unit tests
   pass locally (silently hitting the real DB) and fail in the DB-less CI unit job. Repro
   the CI condition locally with `env -u DATABASE_URL pnpm test`.
3. **Integration tests run PR-only in CI.** Any phase that changes a response envelope must
   run `pnpm test:integration:local` explicitly before merge.
4. **Never point integration tests at `.env.local`.** Its `DATABASE_URL` is **production**.
   Use `pnpm test:integration:local` / `db:test-local:reset`. This is how test communities
   leaked into prod.
5. **When a response shape changes, sweep both patterns.** Grep the integration directory
   for the URL substring *and* for `routeModule.GET(` style direct calls — the URL grep
   alone misses tests that import the route module.
6. **Turbo can serve a stale green typecheck.** Final verification for a phase runs
   `pnpm typecheck` after the change, not from cache.

### 2.4 Per-phase test floor

No phase is done without, at minimum:

- unit tests for any new pure logic, **including the edge cases named in the phase**;
- a route test per new endpoint covering **authorized / wrong-role / cross-tenant / invalid
  input**;
- a component test for any new interactive surface covering **keyboard operation**;
- an axe assertion for any new full surface;
- `pnpm lint && pnpm typecheck && pnpm test` green.

---

## 3. The phases

### Phase 0 — Editor route group and rollout flag

**Goal.** A shell-less route that is exactly as protected as the page it replaces.

**Files.**
- `apps/web/src/app/(site-editor)/layout.tsx` — new. Auth, community resolution, PM role,
  `hasSiteEditor` plan gate, lapsed-community gate, **`AppQueryProvider`**, collapsed
  `NavRail`, `Toaster`.
- `apps/web/src/app/(site-editor)/pm/settings/website/page.tsx` — new; renders the v3 shell
  when the flag is on.
- `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` — unchanged; the flag
  decides which is served.
- `scripts/perf-check.ts` — add a `site-editor` group so the canvas bundle is budgeted from
  day one rather than discovered at 700 KiB.

**The flag.** Server-side `SITE_EDITOR_V3_ENABLED`, read in the RSC — **not**
`NEXT_PUBLIC_*`. A rollout flag is not an entitlement, it does not belong in the client
bundle, and a client-readable flag invites the mistake of treating it as a security
boundary. Add to Vercel for Preview and Production before merge.

**Security facts to preserve, and to test.**
- `/pm` is already in `PROTECTED_PATH_PREFIXES` (`apps/web/src/middleware.ts:65`), and a
  route group does not change the URL — so middleware session protection carries over
  unchanged. **But middleware checks session only**: role, tenancy and plan are the page's
  job, exactly as in the current page.
- Route-group layouts do **not** inherit from `(authenticated)`. Anything that layout
  provided and is still needed must be re-established explicitly. `AppQueryProvider` is the
  one that fails loudest — React Query hooks 500 without it.

**Tests.**
| Test | Asserts |
|---|---|
| `__tests__/app/site-editor/route-group-auth.test.tsx` | unauthenticated → redirect to login; resident → redirected; PM in a *different* community → redirected; `hasSiteEditor: false` → gated |
| same | lapsed community → blocked by the read-entitlement/lockout path |
| `__tests__/app/site-editor/flag.test.tsx` | flag off → legacy page; flag on → v3 shell |
| `__tests__/providers/site-editor-query-provider.test.tsx` | a React Query hook mounts without throwing inside the new group |

**Gate.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm perf:check`

**Rollback.** Unset the flag. The legacy page is untouched.

---

### Phase 1 — Editor shell

**Goal.** Three-column chrome with the existing forms inside it. No behaviour change.

**Files.** `apps/web/src/components/pm/site-editor-v3/` — `EditorShell.tsx`,
`ToolPanel.tsx`, `ToolTabs.tsx`, `PanelResizer.tsx`, `PhoneGate.tsx`, `EditorTopBar.tsx`.

**Tests.**
| Test | Asserts |
|---|---|
| `ToolTabs.test.tsx` | `role="tablist"`, `aria-selected`, arrow-key traversal, `aria-controls` resolves |
| `PanelResizer.test.tsx` | `role="separator"`, `aria-valuenow/min/max`; ArrowLeft/Right move 16px, Shift 48px, Home/End clamp to 280/560; width persists |
| `PhoneGate.test.tsx` | renders under 768px; the urgent-notice path is reachable; the editor is not merely hidden but unmounted |
| `axe-audit.test.tsx` (extend) | zero violations on the shell |

**Edge cases that must be covered:** resizer clamped at both ends; a persisted width outside
`[280, 560]` (corrupt `localStorage`) is clamped, not honoured; `prefers-reduced-motion`
disables the panel transition.

**Gate.** `pnpm lint && pnpm typecheck && pnpm test && pnpm perf:check`

---

### Phase 2a — Split the data-fetching renderers *(pure refactor, touches the live site)*

**Goal.** Make the four SoR blocks renderable in a client canvas without forking them.

**The problem.** `AnnouncementsBlock`, `DocumentsBlock`, `MeetingsBlock` and `ContactBlock`
are `export async function` components that call `getPublicCommunityScopedReader()` inside
themselves. An async server component cannot render in a client canvas that updates on
keystroke. The other six (Hero, Text, Image, Faq, Gallery, Amenities) are already pure.

**The split**, per block:
- `DocumentsBlock.tsx` keeps the async shell: validate content, fetch, render `<DocumentsBlockView data={…} content={…} />`.
- `DocumentsBlockView.tsx` — new, pure, prop-driven, no data access. **One** presentational
  component, used by the public site and the canvas alike, so nothing forks.

**Files.** Four new `*View.tsx`; four shells reduced to fetch-and-delegate;
`blocks/types.ts` gains a view-props type; `blocks/registry.ts` gains a comment recording
that views must stay hook-free and prop-driven.

**Tests.**
| Test | Asserts |
|---|---|
| existing `__tests__/components/public-site/*` | **must pass unchanged** — this is the proof the refactor is behaviour-neutral |
| new `*View.test.tsx` × 4 | renders from props alone; empty state; malformed content |
| `__tests__/app/public-site/site-page.test.tsx` | public page output unchanged |

**Gate.** `pnpm test` plus `pnpm test:integration:local apps/web/__tests__/integration` for
anything covering the public site. This phase changes the live public site — it merges and
is verified **before** 2b starts.

**Rollback.** Revert; the split is self-contained.

---

### Phase 2b — The canvas

**Goal.** The redesign proper.

**Files.** `site-editor-v3/canvas/` — `Canvas.tsx`, `SectionShell.tsx`, `FloatControls.tsx`,
`SectionInserter.tsx`, `SectionList.tsx`, `Inspector.tsx`.

**Tests.**
| Test | Asserts |
|---|---|
| `SectionShell.test.tsx` | click selects; `Alt+↑/↓` moves and is announced; controls reachable by keyboard, not hover-only |
| `SectionList.test.tsx` | drag reorder **and** grip-button + arrow-key parity; drop indicators; reorder announced via live region |
| `Inspector.test.tsx` | Esc closes; focus returns to the trigger; overlay mode below 1280px |
| `Canvas.test.tsx` | data-driven blocks receive data as props and do **not** refetch per keystroke |
| `axe-audit.test.tsx` | zero violations with a section selected |

**Edge cases:** moving the first section up and the last down are no-ops, not errors;
removing the selected section clears selection rather than leaving a dangling reference;
a block type with no renderer is skipped with a warning (existing behaviour) rather than
crashing the canvas.

**Performance.** Dynamic-import block views through the registry so only rendered types
enter the bundle. Memoise per section — a keystroke in the inspector must not re-render
every section. `pnpm perf:check` must pass with the new `site-editor` group.

---

### Phase 3 — Autosave, toasts, dialogs, preview

**Files.** `site-editor-v3/useAutosave.ts`, `StatusLine.tsx`, `PreviewDialog.tsx`; confirms
on `components/ui/alert-dialog.tsx`; toasts on `sonner` (already mounted in
`app/layout.tsx`, already used by `PublishBar`).

**Do not port** v3's hand-rolled `useTrap` — Radix already traps, restores focus and inerts
the background. Porting it would be a second, worse focus manager.

**Tests.**
| Test | Asserts |
|---|---|
| `useAutosave.test.ts` | debounce coalesces bursts into one request; a failed save surfaces an error state and **retries**; a save in flight is not duplicated |
| `StatusLine.test.tsx` | Saving → Draft saved → timestamp; error state is announced |
| `undo-toast.test.tsx` | undo restores the prior draft; the toast is dismissible; undo after the toast expires is impossible, not silently broken |

**Edge case that matters:** autosave must not fire on mount or on a no-op change — an
editor that writes on open produces phantom "changes waiting".

---

### Phase 4 — The change model *(the pivot — checkpoint here)*

**Goal.** A typed diff between draft and last published.

**Files.** `packages/shared/src/site-diff/` — `diff.ts`, `validate.ts`, `types.ts`. Shared,
because publish-time validation must run **server-side too**; a client-only gate is a
suggestion, not a gate.

**Change keys.** `hero`, `style`, `footer`, `site`, `page:<id>`, `pageorder`,
`block:<id>`, `order:<pageId>`.

**Tests** — this is the most test-dense phase, and the cheapest place to be thorough:
| Test | Asserts |
|---|---|
| `diff.test.ts` | no published state → everything reads `added`; identical → empty; edit/add/remove/reorder each produce the right kind; reorder is its own key, not N block edits |
| `diff.test.ts` | a block edited **and** moved yields both `block:<id>` and `order:<page>` |
| `diff.test.ts` | removing a page yields `page:<id>` removed **and** does not also emit per-block changes for its blocks |
| `validate.test.ts` | every rule in `blockIssues`/`heroIssues`/`pageIssues`/`siteIssues`; empty body, missing alt on a non-decorative image, blank FAQ answer, duplicate page name/slug, **reserved slug** |
| `contrast.test.ts` | ratio maths against known pairs; below 4.5:1 blocks; invalid hex is rejected, not silently passed |
| `diff.property.test.ts` | round-trip — `applySel(pub, draft, allKeys)` deep-equals `draft` for a set of generated drafts. This one property catches more than a dozen hand-written cases |

**Gate.** Full unit suite plus `pnpm test:integration:local` for the server-side validator.

**Checkpoint.** Stop here for review before Phase 5.

---

### Phase 5 — Review-and-publish sheet (atomic, permanently)

**Files.** `site-editor-v3/publish/PublishSheet.tsx`, `Receipt.tsx`; extend
`hooks/use-publish-site.ts`.

**Atomic, by decision.** With selective publish cut, the sheet has no tick boxes and no
dependency gating — it lists every change, blocks on validation, and publishes all of them.
Any change with a blocking issue makes the whole publish unavailable until it is fixed or
reverted, which is why per-change **Revert** (Phase 6) is the escape hatch and needs to be
reachable from this sheet, not only from the Site panel.

**Tests.** Grouped by page with Site-wide first; a single blocking issue disables the
publish button and names the offender; "Fix this" navigates and closes; failure renders a
**persistent** receipt, not a toast; the existing `ConflictError` from a concurrent publish
is surfaced as "someone else published", not a generic 500; publishing with zero changes is
impossible rather than a no-op request.

**Server-side validation is mandatory here.** The sheet may not be the only thing standing
between an invalid draft and the public site — `publishCommunitySite` validates with the
shared validator and refuses.

---

### Phase 6 — Publish history + revert  ⟵ **GATE G1**

**Migration.** Next free number — **re-check `packages/db/migrations/` before authoring**;
`0034` at the time of writing. Creates `site_publish_snapshots`.

**RLS — the security decision in this phase.** `site_blocks` uses
`policyFamily: 'public_read_service_write'` because the public site reads it anonymously.
**Snapshots must not follow that family.** They are an internal audit artefact; anon must
never read them. Register as **`service_only`** in
`packages/db/src/schema/rls-config.ts`, with a `notes` entry explaining the
trigger-exempt rationale (all writes are service-role, as with `site_blocks`), and bump
`RLS_EXPECTED_TENANT_TABLE_COUNT` **at merge time**.

**Files.** `packages/db/src/schema/site-publish-snapshots.ts`; `site-blocks-service.ts`
gains `captureSnapshot` (inside the existing publish transaction) and `revertToSnapshot`;
`api/v1/pm/site/publish/revert/{route,contract}.ts`;
`api/v1/pm/site/publish/history/{route,contract}.ts`.

**The history endpoint is a list endpoint** — it must paginate via `paginate()` from
`@propertypro/db` and return the canonical double-wrapped envelope (ADR-003). It is also an
admin GET, so it will trip `guard:read-entitlement` unless it calls
`requireEntitledForAdminRead` — which is precisely correct for a lapsed community.

**Tests.**
| Test | Asserts |
|---|---|
| `__tests__/api/pm-site-publish-revert.test.ts` | PM authorized; resident rejected; **a snapshot id from community A cannot be restored into community B** (IDOR) |
| same | reverting when `snapshot IS NULL` (pruned) returns a clear 4xx, not a 500 |
| `__tests__/api/pm-site-publish-history.test.ts` | paginated envelope; **the response contains no `snapshot` payload**; cursor is opaque and echoed |
| `__tests__/integration/site-publish-snapshot.integration.test.ts` | snapshot is written in the same transaction as the publish — a rolled-back publish leaves none |
| same | revert is atomic; the partial unique index `(community_id, block_order, is_draft) WHERE deleted_at IS NULL` is never violated (delete-then-insert ordering) |
| same | revert advances `MAX(published_at)`, so a stale `expectedPublishedAt` raises `ConflictError` |
| same | tombstone draft rows are **not** resurrected by a revert |
| `packages/db/__tests__/rls-policies.integration.test.ts` | anon and authenticated cannot select from `site_publish_snapshots` |
| `rls-config.test.ts` | the new table is registered and the count matches |
| `__tests__/services/snapshot-retention.test.ts` | pruning nulls `snapshot` beyond N and **keeps the log row** |

**Gate.** `pnpm test && pnpm test:integration:local && pnpm lint && pnpm typecheck`, then
**G1**: apply the migration via Supabase MCP, verify via `information_schema`, record the
ledger row (`hash` = sha256 of the file bytes, `created_at` = the journal `when`).

---

### Phase 11 — Multi-page  ⟵ **GATES G2, G3**

Three sub-phases, two migrations, two deploys.

**11a — expand (G2).** New `site_pages` and `site_page_redirects`; `site_blocks.page_id`
nullable; backfill to each community's home page; create the 4-column partial index
alongside the 3-column one. Both new tables are read anonymously by the public site →
`public_read_service_write`, matching `site_blocks`. Two `RLS_EXPECTED_TENANT_TABLE_COUNT`
bumps, re-derived at merge.

**11b — code.** *(preceded by 11b-0, below)* Pages manager; `page_id` threaded through `reorderSiteBlock`,
`removeSiteBlock`, `upsertPublishedBlock`, `discardSiteDrafts`, `publishCommunitySite`
(its "which `block_order`s have a live draft" step becomes `(page_id, block_order)`);
`app/public-site/[[...slug]]/page.tsx`; nav in `PublicSiteHeader`; redirect resolution;
404.

**11c — contract (G3).** Only after 11b is **live in production**: drop the 3-column index,
`SET NOT NULL` on `page_id`.

**11b is blocked by middleware ordering — found during this review, and it is not small.**

`isProtectedPath(pathname)` runs at `apps/web/src/middleware.ts:564`. The community-host
public-site rewrite runs at `:770`. So on `sunset-condos.getpropertypro.com`, a request to
`/documents` is caught by the protected-path branch and redirected to login — it never
reaches the public site. `PROTECTED_PATH_PREFIXES` (`:65`) contains `/documents`,
`/announcements`, `/payments`, `/assessments`, `/contracts`, `/violations`, `/settings`,
`/help`, `/notifications`, `/maintenance`, `/communities`, `/onboarding`, `/emergency`,
`/finance`, `/esign`.

Two consequences:

1. **v3's own default page set collides.** Its seed pages are "Documents" (`/documents`) and
   "Meetings" (`/meetings`). The first is protected. These are also the most obvious page
   names for a Florida records site — banning them is not an acceptable answer.
2. **The existing rewrite discards the path.** It sets `siteUrl.pathname = '/public-site'`
   outright, so the community host serves exactly one page today. Multi-page requires the
   slug to survive the rewrite.

**Resolution.** Resolve the host *before* enforcing protected paths: on a community public
host (subdomain or verified custom domain), the app routes are not reachable anyway, so
protected-path enforcement should not apply there. Then rewrite to
`/public-site/<slug>` preserving the path. The alternatives are worse — prefixing public
pages (`/p/documents`) breaks v3's slug model and every printed URL, and banning fifteen
common words from page names is a product failure.

This is a **middleware reordering on the request path of every request in the app**, so it
is its own sub-phase, landed and verified alone:

**11b-0 — middleware host-precedence fix.** Reorder host resolution ahead of
`isProtectedPath`; preserve the slug through the rewrite. Tests:
`__tests__/middleware/*.test.ts` for every combination of {app host, community subdomain,
custom domain} × {protected path, public slug, api path} × {authenticated, anonymous}; plus
the existing `apps/web/e2e/community-tenant-host-precedence.spec.ts`, extended. **No app
route may become reachable without auth on the app host** — that is the regression this
phase risks, and the assertion that must be loudest.

**Open behaviour question for 11b-0.** An *authenticated* user on a community host is
currently redirected to the dashboard (`:760`). With multi-page, a logged-in resident
following a link to `sunset-condos.getpropertypro.com/documents` would be bounced to the app
instead of seeing the public page. Today that only affects `/`. Decide before 11b-0 ships:
keep the redirect (public pages are for the public) or serve the public page to everyone.

**Security.** Slugs are attacker-adjacent input on a public surface.
- Reserved-slug list, sourced from `PATH_PUBLIC_SUFFIXES` and `PROTECTED_FIRST_SEGMENTS` in
  `apps/web/src/lib/middleware/public-host-routes.ts` — the authoritative list, not a
  hand-copied one. `transparency`, `notices`, `request-access`, `unavailable` are already
  served on the public host and must stay reserved even after 11b-0.
- `slugify` output must be validated, not trusted: reject empty, `.`/`..` segments, and
  anything not matching `^/[a-z0-9-]+(/[a-z0-9-]+)*$`.
- Case-collision: `/Docs` and `/docs` must not coexist.
- A slug held by a redirect is reserved; `pageIssues()` says so in words.
- Redirect resolution must not loop: A→B→A. Cap the chain and test it.

**Tests.**
| Test | Asserts |
|---|---|
| `__tests__/lib/site-pages/slug.test.ts` | reserved, malformed, traversal, unicode, duplicate-case (`/Docs` vs `/docs`) |
| `__tests__/integration/site-pages.integration.test.ts` | per-page ordering independent; the new index prevents duplicate `(page, order, is_draft)`; deleting a page cascades its blocks |
| same | redirect chains resolve; a cycle terminates |
| `__tests__/app/public-site/catch-all.test.tsx` | unknown slug → 404; old slug → redirect; nav lists only `in_nav` pages in `sort_order` |
| `packages/db/__tests__/rls-policies.integration.test.ts` | anon reads **published** pages only — never drafts |
| E2E `apps/web/e2e/site-editor-multipage.spec.ts` | create page → add section → publish → visit the public URL → rename → old URL still resolves |

**Rollback.** 11b is revertible while the 3-column index still exists — which is exactly why
G3 waits.

---

### Phase 7 — Urgent notice

**The highest-blast-radius write in the product**: it bypasses the draft layer and is public
immediately. Treat it accordingly.

**Security.**
- Same PM role + plan gate as publish; audit-logged via `logAuditEvent`.
- 240-char cap enforced **server-side**, not just by `maxLength`.
- Rendered as a React text child — **never** `dangerouslySetInnerHTML`. Test that a
  `<script>` payload renders as visible text.
- Refused when the site has never been published ("there's nowhere to show a notice").
- Expiry compared at render time so a missed cron cannot strand a live banner.

**Tests.** Route authz + cross-tenant; XSS payload escaped in the public render; expired
notice not rendered even if the row persists; removal is undoable within the toast window;
`role="alert"` present.

---

### Phase 8 — Site settings + footer

**Tests.** Title/description length limits server-side; the indexing flag actually reaches
`robots`; the SERP preview is `aria-hidden` decoration, not content; the statutory footer
line is **opt-in** and ships with its counsel warning (see gap analysis §5 — this is a
compliance constraint, not copy polish).

---

### Phase 9 — Content additions

Hero photo array + carousel · block layout variants + empty text · `payments` block ·
(site settings/footer are Phase 8).

**`payments` needs a migration** to extend `site_blocks_block_type_check` — the block-type
list is a CHECK constraint, not an enum. Its target defaults to the portal's `/payments`
via `buildCommunityUrl()`, with an optional PM override validated by the existing
`ctaTargetSchema` (`packages/shared/src/site-blocks/types.ts:63`), which already rejects
protocol-relative and backslash open-redirect forms.

**Tests.**
| Test | Asserts |
|---|---|
| `carousel.test.tsx` | pause control; dot navigation; `aria-roledescription`; live region announces slide changes; `prefers-reduced-motion` disables autoplay |
| `hero-photos.test.ts` | non-decorative photo without alt blocks publish; the legacy single `heroImagePath` upgrades to a one-element array on read |
| `payments-target.test.ts` | `//evil.com`, `/\evil.com`, `\\evil.com`, `javascript:` all rejected; `https://` accepted; external targets render `rel="noopener noreferrer"` |
| block-type migration test | the CHECK constraint accepts `payments` and still rejects garbage |

---

### Phase 10 — Guided setup in-editor + Help tab

Progress persists to `communities.site_onboarding_progress` / `onboarding_wizard_state` —
v3's `localStorage` resume is **not** ported.

**Tests.** Resume after unmount; resume in a **second browser session** (the test that
proves the decision); re-running setup shows a diff before it overwrites; completion stamps
`site_onboarding_completed_at`.

---

### Phase 12 — Flag flip and retirement

Delete `(authenticated)/pm/settings/website/page.tsx` and any component only it used; remove
the flag; drain `scripts/design-token-baseline.json` entries the deleted files held.

**Tests.** Nav still resolves; no dead imports (`pnpm typecheck`); `pnpm lint` clean with
the baselines ratcheted **down**.

---

## 4. Cross-cutting concerns

### 4.1 Security summary

| Surface | Risk | Control | Phase |
|---|---|---|---|
| New route group | Losing the shell's auth | Middleware `/pm` prefix still applies; page re-asserts role + tenancy + plan | 0 |
| Every new route | Missing authz | `requirePermission` + `requireCommunityMembership` + contract auto-suite RBAC check | all |
| Revert endpoint | IDOR via `snapshotId` | Scoped client; the id is filtered by `communityId`, never trusted alone | 6 |
| History endpoint | Leaking draft content | Response schema omits `snapshot`; table RLS is `service_only` | 6 |
| Admin GETs | Lapsed-community read | `requireEntitledForAdminRead`, enforced by `guard:read-entitlement` | 0, 6 |
| Urgent notice | Immediate public XSS | Text-only render; server-side length cap; audit log | 7 |
| Page slugs | Traversal / route collision | Strict pattern, reserved list sourced from `public-host-routes.ts`, redirect-cycle cap | 11 |
| **Middleware reorder (11b-0)** | **An app route becoming reachable without auth** | Host resolved first, but protected-path enforcement dropped *only* on community public hosts; exhaustive host × path × auth matrix tests | 11 |
| Payments target | Open redirect | Existing `ctaTargetSchema`; `rel="noopener noreferrer"` | 9 |
| All content writes | Mass assignment | Every block schema `.strict()` — as `heroBlockSchema` already is | 2b, 9 |
| Uploads | Unvalidated media | Existing `/api/v1/site/uploads/presign` + `images/finalize` + `validate-upload.ts` — reuse, do not add a second path | 9 |

No credentials, tokens or PII are introduced by this program. Nothing new is logged that
was not already logged.

### 4.2 Performance

- Add a `site-editor` group to `scripts/perf-check.ts` in **Phase 0**, so the budget is
  enforced from the first commit rather than breached at Phase 2b. Hard route budget is
  700 KiB; the aggregate ceiling is 1300 KiB.
- Dynamic-import block views via the registry — only rendered types load.
- Memoise per section; a keystroke must not re-render the whole canvas.
- Autosave debounces and coalesces; the canvas never refetches SoR data per keystroke.
- The public site is a statutory entry point with its own perf group — Phase 2a and Phase 11
  must not regress it.

### 4.3 Database and storage

- Three new tenant tables. Families: `site_publish_snapshots` → `service_only`;
  `site_pages`, `site_page_redirects` → `public_read_service_write` (the public site reads
  them anonymously).
- All writes are service-role, so all three are trigger-exempt like `site_blocks` — record
  the rationale in each `notes` field, because `rls-policies.integration.test.ts` keys its
  per-table overrides off them.
- `RLS_EXPECTED_TENANT_TABLE_COUNT` (62 today) rises by 3 across Phases 6 and 11 —
  **re-derive at merge**, never author ahead.
- RLS policies ship **in the migration SQL**, never applied by hand.
- Storage: no new bucket. Hero photo arrays reuse the existing presign/finalize path and
  its RLS (migration 0017).

### 4.4 Environment

| Variable | Where | Notes |
|---|---|---|
| `SITE_EDITOR_V3_ENABLED` | Vercel Preview + Production | Server-side only. Deliberately not `NEXT_PUBLIC_` |

No new third-party service, account, key or credential. If that changes — say, a decision
to use an external image CDN — it must be raised before dependent code is written.

---

## 5. Honest assessment

Where I think the plan is weak, or the design is wrong.

**1. Selective publish was cut — accepted 2026-07-25.**
It had the highest complexity-to-value ratio in the program: per-key promotion against a
slot-based `block_order` model, parent/child dependency rules between pages and their
blocks, and a failure mode that produces an incoherent *published* site. The need it served
— "I'm not ready to publish this one thing" — is met by Phase 6's one-step and per-change
revert at a fraction of the cost. Phase 5's review sheet is therefore atomic **permanently**:
no tick boxes, no dependency gating, no partial-promotion path in `publishCommunitySite`.
If it is ever revived, the Phase 4 round-trip property test is the foundation it needs.

**2. Two editors coexisting is real debt, and the flag must have an expiry.**
Phases 0–12 run with both editors live against shared write routes. That is the right call
for safety, but "temporary" dual maintenance has a way of becoming permanent. Phase 12
should be scheduled, not aspirational.

**3. The concurrency story is thinner than it looks.**
`expectedPublishedAt` protects *publishes* from clobbering each other. It does nothing for
two PMs editing different sections of the same draft simultaneously — last write wins, per
field, silently. v3's attribution UI ("Edited by Dana Reyes") makes this *more* visible
without making it *safer*, which risks implying a guarantee that is not there. Worth a
decision before Phase 4: either accept and word the UI carefully, or add per-row version
checks on draft writes.

**4. The change model belongs in `packages/shared`, and this is load-bearing.**
If the diff and validators live only in the editor, publish-time validation is advisory.
A determined or buggy client can publish an invalid site. Phase 4 puts them in shared and
Phase 5 calls them server-side; that ordering is not negotiable.

**5. I got the renderer reuse wrong the first time.**
The gap analysis originally asserted all ten public-site block renderers were prop-driven.
Four of them fetch. I verified the absence of `'use client'` and inferred the rest, which
is exactly the kind of shortcut this checklist exists to catch. Corrected in gap analysis
§9 row 3, and Phase 2a now exists because of it.

**6. Multi-page is bigger than the gap analysis said, because of the middleware ordering.**
Phase 11 now contains a reordering of the request path for *every request in the
application* (11b-0). That is a materially higher risk than "add a page dimension to a
table", and it is the one change in this program that could plausibly expose an
authenticated route. It deserves its own PR, its own review, and the most paranoid test
matrix in the plan. It is now sequenced second-to-last precisely so that
dropping it costs nothing already built — Phase 12 does not depend on it.

**7. Thirteen phases in one unattended run is a lot of code with no human eye on it.**
The gates in §1 are policy-mandated. The Phase 4 checkpoint is my recommendation and is
worth taking even though nothing enforces it. 11b-0 is a second place I would want a human
to look before it merges.

---

## 6. Verification checklist

Worked item by item. "Partial" and "N/A" are used where they are true; a plan that scores
itself all-green is not a plan that was checked.

### Root cause & research

| Item | State | Evidence |
|---|---|---|
| Root cause, not symptoms | ✅ | The absence of a draft-vs-published diff, not the visual design. Named in gap analysis §1 and made Phase 4, the pivot the roadmap is built around |
| Industry best practices | ✅ | WCAG 2.1 AA — 2.4.7 focus visible (never suppress `:focus-visible`), 2.5.8 target size (36 px per repo rule, above v3's 32), 1.4.3 contrast (the 4.5:1 publish gate). ARIA Authoring Practices for tabs, carousel (`aria-roledescription`, pause control) and live regions. OWASP — open redirect (A01), IDOR (A01), XSS (A03), mass assignment via `.strict()`. Expand/contract migration discipline for zero-downtime schema change |
| Existing codebase patterns | ✅ | Contract auto-suite, `paginate()` + ADR-003 envelope, `runRoute` + `tenantScope`, RLS policy families, `sonner`, Radix dialogs, `ctaTargetSchema`, `buildCommunityUrl`, `requireEntitledForAdminRead`, the perf-check groups — all reused rather than reinvented |
| Additional research where needed | ✅ | Two findings came only from reading source: the four data-fetching renderers (§Phase 2a) and the middleware ordering blocker (§Phase 11b-0). Both changed the plan |

### Architecture & design

| Item | State | Evidence |
|---|---|---|
| Current architecture fit | ✅ | Three genuine mismatches named: Option B fights the shell (route group must re-establish five things), `block_order` fights multi-page (index change + backfill), `is_draft` rows fought selective publish, which is why that phase was cut |
| Recommended changes where beneficial | ✅ | Container/presentational split for four renderers; middleware host-precedence reorder; change model in `packages/shared` so validation is server-enforceable |
| Technical debt impact | ✅ | §5.2 — dual editors for eleven phases, with Phase 12 scheduled rather than aspirational. Also noted: `public_read_service_write` has no write trigger, so the new tables inherit that trust-the-service-role posture |
| Challenged suboptimal patterns | ✅ | §5.1 recommends **cutting Phase 7** despite it being agreed scope. §5.3 says the attribution UI implies a concurrency guarantee that does not exist. §5.6 says multi-page may deserve to be a separate project |
| Not a yes-man | ✅ | §5.5 records that I got the renderer reuse wrong and why. §5.6 pushes back on the scope the user approved |

### Solution quality

| Item | State | Evidence |
|---|---|---|
| CLAUDE.md compliant | ✅ | Scoped DB access, `@propertypro/db/filters`, migration numbering re-checked at authoring, manual prod applies, tenant-table conventions (`community_id` FK, `deleted_at`, RLS), design tokens, page-padding, breadcrumb rules (moot under Option B, noted) |
| Simple, no redundancy | ✅ | Every layer reuses an existing primitive; the only genuinely new components are the six canvas-specific ones the gap analysis §6 identifies as having no repo equivalent |
| 100% complete | ⚠️ **Partial, by design** | Every phase has files, tests, gate and rollback. What is *not* pinned: exact line-level diffs, and the two behaviour questions flagged inline (authenticated users on a community host; whether Phase 7 ships). Those are decisions, not omissions |
| Trade-offs explained | ✅ | Per decision in gap analysis §9; per phase here; the honest ones in §5 |
| Long-term maintainability | ✅ | One presentational component per block type (no fork); validators shared, not duplicated; flag with a scheduled removal; reserved-slug list sourced from the authoritative module rather than copied |

### Security & safety

| Item | State | Evidence |
|---|---|---|
| No vulnerabilities introduced | ✅ | §4.1 enumerates nine surfaces with a control and a phase each |
| Input validation & sanitisation | ✅ | Zod `.strict()` on every content schema; server-side length caps; slug pattern + reserved list; `ctaTargetSchema` for URLs; urgent-notice text rendered as a React child, never `dangerouslySetInnerHTML`, with an explicit XSS test |
| Authn/authz | ✅ | Middleware `/pm` prefix preserved; page re-asserts role + tenancy + plan; `requirePermission` per route; contract auto-suite validates the RBAC label; cross-tenant test on every new endpoint; IDOR test on revert |
| Sensitive data protected | ✅ | Snapshots are `service_only` RLS and omitted from the history response. No credentials, tokens or PII introduced; no new logging of existing sensitive fields |
| OWASP followed | ✅ | A01 broken access control (IDOR, cross-tenant, the 11b-0 regression risk), A03 injection (XSS in the notice), A01 open redirect (payments target), mass assignment (`.strict()`) |

### Integration & testing

| Item | State | Evidence |
|---|---|---|
| Upstream/downstream impacts | ✅ | Public site (2a, 11), middleware (11b-0), perf budget (0), RLS count (6, 11), audit log, existing hooks (`use-publish-site`), the legacy editor sharing the same write routes |
| All affected files updated | ⚠️ **Named, not yet edited** | This is a plan; §3 lists the files per phase. The claim is that the *list* is complete, and it was derived by reading the modules rather than guessing |
| Consistent with valuable patterns | ✅ | See "existing codebase patterns" above |
| Fully integrated, no silos | ✅ | Shared validators; one renderer per block; reused upload path; reused toast/dialog/table primitives; no parallel help system, no second progress store |
| Tests with edge cases | ✅ | Each phase names its edge cases explicitly — clamped resizer, corrupt persisted width, first/last section moves, dangling selection, autosave-on-mount, pruned snapshot, redirect cycles, case-colliding slugs, expired notice, legacy single hero image |

### Technical completeness

| Item | State | Evidence |
|---|---|---|
| Environment variables | ✅ | One: `SITE_EDITOR_V3_ENABLED`, server-side, Preview + Production, §4.4. No new third-party service or credential — and if that changes it gets raised before dependent code is written |
| DB / storage rules | ✅ | §4.3 — three tables, policy family per table with the reasoning, trigger-exempt rationale, RLS in the migration SQL, count re-derived at merge, no new storage bucket |
| Utils & helpers checked | ✅ | `paginate`, `runRoute`/`tenantScope`, `requestJson`, `walkPaginated`, `buildCommunityUrl`, `ctaTargetSchema`, `getStatusConfig`, `cn`, `requireEntitledForAdminRead`, `validate-upload` — reused; gap analysis §6 maps v3's vocabulary onto them |
| Performance analysed | ✅ | §4.2 — budget group added in Phase 0 rather than breached in Phase 2b; dynamic imports; memoisation; debounced autosave; no per-keystroke SoR refetch; public-site perf group protected through 2a and 8 |

**Two items are honestly partial**, both marked above: "100% complete" (two behaviour
decisions remain open by choice) and "all affected files updated" (a plan names files; it
does not edit them).

---

## 7. Definition of done, for any phase

1. Every file in the phase's file list exists and is imported by something.
2. Every test in the phase's test table exists and passes.
3. `pnpm lint && pnpm typecheck && pnpm test` green — typecheck run fresh, not from cache.
4. Integration and E2E run where the phase table says so.
5. `pnpm perf:check` green.
6. Guards clean, with no new baseline entries and no new exemptions beyond those the phase
   explicitly justifies.
7. Nothing in the phase is left `TODO`.

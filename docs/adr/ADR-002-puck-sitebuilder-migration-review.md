# Senior Dev Code Review: Puck Sitebuilder Migration Plan

## Verdict: Proceed with revisions. The architecture is fundamentally sound, but there are several verified issues that will cause real bugs or wasted work if not addressed before implementation.

---

## CRITICAL — Must fix before writing code

### 1. Wrong package name — `@measured/puck` is deprecated

The plan specifies `@measured/puck` throughout. As of [Puck 0.21](https://puckeditor.com/blog/puck-021), the package moved to `@puckeditor/core`. The old `@measured/puck` npm package is deprecated and will stop receiving updates. The migration guide is at the [Puck docs](https://puckeditor.com/docs).

**Fix:** Replace all references to `@measured/puck` with `@puckeditor/core`. Update imports accordingly. This also changes `transpilePackages` in `next.config.ts`.

### 2. The translation layer ignores the `(community_id, block_order, is_draft)` unique constraint

Verified in `packages/db/src/schema/site-blocks.ts:37-42`:
```
unique('site_blocks_community_order_draft_unique').on(
  table.communityId,
  table.blockOrder,
  table.isDraft,
)
```

The plan's `diffPuckData()` function will generate reorder operations (and block creations) that assign `block_order` values. If the diff produces overlapping order values during a swap (e.g., block A: order 1→2, block B: order 2→1), the parallel `reorderBlocks()` function in `site-blocks-queries.ts:112-131` will hit unique constraint violations because each update is a separate Supabase REST call (not a single transaction).

**This is actually a pre-existing bug** in the current codebase — `reorderBlocks` uses `Promise.all` with separate HTTP calls. But the current BlockEditor might avoid triggering it due to how @dnd-kit reports reorders. The Puck translation layer will absolutely hit it because `diffPuckData` will produce reorder payloads on every debounced save.

**Fix:** The translation layer should either: (a) use a two-pass reorder strategy (set all to temporary negative orders first, then to final orders), or (b) serialize reorder updates sequentially instead of in parallel.

### 3. Race condition: new blocks created before prior save completes

The plan says new blocks in Puck state (without `_blockId`) get POSTed to the API. Consider this sequence:

1. User drags Hero block from sidebar → Puck state now has a block with no `_blockId`
2. Debounce timer starts (1000ms)
3. User immediately drags a Text block → second block with no `_blockId`
4. User edits Hero block's headline
5. Debounce fires → `diffPuckData()` sees 2 new blocks → POSTs both → gets back IDs
6. But step 4's edit targeted the Hero block *before* it had a DB ID, so the edit may be lost

The plan says it stashes `_blockId` as a hidden prop, but doesn't specify *when* it gets backfilled into Puck state after the POST returns. If Puck's state has already moved on (more edits), updating it with the returned ID will either be stale or cause a state conflict with Puck's internal state management.

**Fix:** Define the ID backfill strategy explicitly. Options: (a) optimistic UUID-based client IDs that map to server IDs in a lookup table, or (b) immediately POST new blocks on drop (not debounced) so they always have IDs before any content edits.

### 4. No partial save failure recovery

The `diffPuckData()` produces a `ChangeSet` with potentially multiple API calls (creates, updates, reorders, deletes). If call 2 of 5 fails:

- Calls 1 succeeded → DB is partially updated
- Puck state still reflects the full intended change
- On next debounce, `diffPuckData()` re-diffs against stale "known rows" → may produce duplicate creates or miss updates

The current `BlockEditor.tsx` handles this gracefully because each block saves independently with its own error state (lines 386-407). The plan's batched diff approach loses this granularity.

**Fix:** After a partial failure, re-fetch from GET `/api/admin/site-blocks` to re-sync "known rows" before the next diff cycle. Or better: track per-operation success and only update "known rows" for operations that succeeded.

---

## SIGNIFICANT — Real problems that should be addressed

### 5. Preview fidelity downgrade is undersold

The current PreviewPanel (`apps/admin/src/components/site-builder/PreviewPanel.tsx`) renders an iframe of the actual public site at `{slug}.propertyprofl.com?preview=true`. This shows the **real** rendered output including:
- Actual DB data (live announcements, real documents, upcoming meetings)
- The community's real theme (colors, fonts)
- Server-rendered async components

The plan replaces this with Puck canvas client-side previews using **hardcoded mock data**. This is a significant fidelity loss for the 3 dynamic block types (Announcements, Documents, Meetings). A board member previewing their site builder will see fake data instead of their real content.

**Suggestion:** Keep PreviewPanel as a secondary "Live Preview" option alongside the Puck canvas. Or, fetch real data client-side for preview components instead of hardcoding mocks.

### 6. Puck 0.21 has built-in AI page generation — Phase 4 should use it

The plan designs a custom Claude AI integration from scratch (API route, chat UI, change banner). But [Puck 0.21 ships with AI page generation in open beta](https://puckeditor.com/blog/puck-021). Before building a custom solution:

- Evaluate whether Puck AI meets the needs
- If building custom, at minimum use Puck's `resolveData` hooks and state management rather than a parallel JSON-editing approach

Phase 4 should be re-scoped to evaluate Puck AI first.

### 7. `onChange` fires on EVERY interaction — the diff-on-debounce approach is expensive

Puck fires `onChange` on drag start, drag move, drag end, field focus, field change, field blur, selection changes, etc. Even with a 1000ms debounce, `diffPuckData()` runs a full deep comparison of the entire page state against known DB rows on every debounce. For a page with 15+ blocks, each with nested content objects, this is non-trivial.

The current BlockEditor only saves when content *actually changes* for a *specific block* — it's surgically targeted. The plan's approach is "diff the world, emit what changed" which is correct but expensive.

**Suggestion:** Use Puck's `usePuck()` hook to track which specific component changed (Puck exposes selected item info and action history). Only diff the affected block, not the entire page.

### 8. Plan says "All 5 existing API endpoints" — there are 7

Verified route files:
1. `GET /api/admin/site-blocks` (list)
2. `POST /api/admin/site-blocks` (create)
3. `PUT /api/admin/site-blocks/:id` (update)
4. `DELETE /api/admin/site-blocks/:id` (soft-delete)
5. `POST /api/admin/site-blocks/publish`
6. `POST /api/admin/site-blocks/discard`
7. `POST /api/admin/site-blocks/reorder`

Not a functional issue, but it suggests the plan author didn't inventory the routes carefully. Make sure the translation layer accounts for all 7.

### 9. PreviewPanel.tsx (150 lines) becomes dead code after Phase 1 but isn't listed for deletion

Phase 1 step 1.6 says "Replace BlockEditor + PreviewPanel two-column grid with PuckEditor" — so PreviewPanel is no longer rendered. But the "Deleted Files" section only lists Phase 5 deletions (BlockEditor + editors/). PreviewPanel.tsx will sit as dead code for potentially months.

**Fix:** Add `PreviewPanel.tsx` to the Phase 5 deletion list, or delete it in Phase 1 since it's being replaced.

### 10. No feature flag or rollback path

There's no way to switch back to the old BlockEditor if Puck breaks in production. Both editors use the same API, so data is compatible. A simple feature flag (`NEXT_PUBLIC_USE_PUCK_EDITOR=true`) in SiteBuilderLayout.tsx would allow instant rollback.

**Suggestion:** For Phase 1, render `PuckEditor` behind a feature flag. Remove the flag in Phase 5 when the old code is deleted.

---

## MINOR — Noted but not blocking

### 11. Mockup file doesn't exist

The plan references `mockups/puck-sitebuilder-mockup.html` as the design target. This file does not exist in the repository. Phase 2's "Custom UI Shell" is designed to match this mockup.

**Fix:** Commit the mockup to the repo or link to an external design file so it's available for Phase 2 implementation.

### 12. Puck 0.21's Plugin Rail may be better than custom shell

The plan designs a fully custom UI shell using Puck headless primitives (`<Puck.Preview>`, `<Puck.Components>`, `<Puck.Fields>`). Puck 0.21 introduces a Plugin Rail with customizable left sidebar UI, `Puck.Layout` for flexible customization, and built-in Blocks/Outline/Fields plugins.

Before building the Phase 2 custom shell from scratch, evaluate whether Puck 0.21's Plugin Rail + `Puck.Layout` achieves 80% of the design with 20% of the effort. The custom shell is a maintenance burden on every Puck upgrade.

### 13. Phase 1 file count

Plan says "~15 files" for Phase 1. Actual count: `puck-config.tsx` + `PuckEditor.tsx` + `translate.ts` + 7 previews + `ThemeProvider.tsx` = 11 new files, plus 2 modified files = 13 total. Minor, but precision matters when scoping a PR.

### 14. Community theme data path not specified

The plan mentions `ThemeProvider.tsx` as a React context providing `CommunityTheme` to previews, but doesn't specify where the theme data comes from. The site-builder page (`apps/admin/src/app/clients/[id]/site-builder/page.tsx`) currently only passes `communityId` and `communitySlug` to the layout. Theme data would need to be fetched and threaded through.

---

## What's GOOD about this plan

- **Incremental phasing is the right call.** Shipping Phase 1 as a standalone PR that can be verified independently is smart.
- **Keeping the DB schema unchanged** avoids a migration and lets both old and new editors coexist during transition.
- **The translation layer concept is architecturally sound** — converting between Puck's Data format and per-row DB storage is the right abstraction boundary.
- **Client-side preview components for server blocks** is the correct approach since Puck's canvas is client-rendered.
- **Draft-first workflow is preserved** — the plan correctly identifies that validation is deferred to publish time.

---

## Summary: Can we proceed as-is?

**No, not without addressing the 4 critical issues.** Specifically:

1. Use `@puckeditor/core` (not deprecated `@measured/puck`)
2. Design the translation layer to handle the unique constraint on reorder
3. Define the new-block ID backfill strategy to avoid lost edits
4. Add partial save failure recovery (at minimum: re-fetch on error)

The significant issues (5-10) should be discussed and either addressed or consciously deferred with documented tradeoffs. The plan is ~85% of the way there — it just needs these gaps closed before implementation begins.

---

## Verification Checklist — Item-by-Item Analysis

### Root Cause & Research

- [x] **Identified root cause, not symptoms** — The plan correctly identifies the UX gap: stacked forms with drag reordering is not a visual canvas. Puck is the right solution for React-based visual editing. The plan attacks the root cause (editor paradigm) rather than symptoms (better form styling, etc.).

- [x] **Researched industry best practices** — Puck is the leading open-source React visual editor. The plan's architecture (translation layer, headless mode, client preview components) follows Puck's documented patterns. **However:** the plan references the deprecated `@measured/puck` package instead of the current `@puckeditor/core` (see Critical #1), suggesting the research is based on older documentation.

- [x] **Analyzed existing codebase patterns** — The plan correctly inventories all 7 block types, identifies the draft/publish workflow, and preserves the existing API contract. **Gap:** missed the unique constraint on `(community_id, block_order, is_draft)` which directly impacts the translation layer.

- [x] **Conducted additional research where needed** — Puck React 19 compatibility is confirmed (Puck 0.17+ supports React 19). **Missing research:** Puck 0.21's built-in AI features and Plugin Rail architecture, which affect Phase 2 and Phase 4 design decisions.

### Architecture & Design

- [x] **Evaluated current architecture fit** — The per-row block storage is kept (correct — schema changes would be high-risk with no clear benefit). The translation layer is the right abstraction boundary between Puck's single-object Data format and the row-per-block DB model.

- [~] **Recommended changes if beneficial** — The plan should recommend extracting two utilities that are currently inlined in `BlockEditor.tsx` before Phase 1:
  - `extractApiError()` (lines 54-74) — reusable across PuckEditor and future admin components
  - `ConfirmDialog` component (lines 278-334) — needed in PuckEditor for publish/discard confirmation

  This prevents duplicating code in the new PuckEditor.

- [x] **Identified technical debt impact** — The plan explicitly creates temporary tech debt (keeping @dnd-kit until Phase 5) and schedules cleanup. Acceptable for incremental delivery. **Additional debt not mentioned:** `PreviewPanel.tsx` becomes dead code after Phase 1 but isn't listed for deletion.

- [x] **Challenged suboptimal patterns** — The diff-on-every-onChange approach is less efficient than the current per-block targeted auto-save. The mock data preview is less faithful than the current iframe preview. Both are acknowledged trade-offs of the Puck paradigm. **Pre-existing issue surfaced:** `reorderBlocks()` using `Promise.all` with non-transactional HTTP calls is a bug waiting to happen (see Critical #2).

- [x] **NOT a yes-man — honest assessment** — This review identifies 4 critical issues, 6 significant concerns, and 4 minor items. The plan is good but not ready to ship as-is.

### Solution Quality

- [x] **CLAUDE.md compliant** — The plan preserves all scoped DB access patterns (`createAdminClient()`), keeps `requirePlatformAdmin()` auth on all routes, and follows the project's conventions (TypeScript, Tailwind, shadcn/ui). All API routes remain unchanged. No imports violate the DB access guard.

- [~] **Simple, streamlined, no redundancy** — Phase 2's fully custom UI shell (PuckShell.tsx with headless primitives) may be unnecessary given Puck 0.21's Plugin Rail and `Puck.Layout`. The plan should evaluate Puck's built-in customization before committing to a custom shell. Also, Phase 4's custom AI chat integration should be evaluated against Puck 0.21's built-in AI page generation (open beta).

- [~] **100% complete (not 99%)** — Gaps:
  1. Theme data fetch path not specified (ThemeProvider needs CommunityBranding from `communities.branding` JSONB column, but page.tsx only passes `communityId` and `communitySlug`)
  2. `PreviewPanel.tsx` deletion not scheduled
  3. No feature flag for rollback during transition
  4. `extractApiError` and `ConfirmDialog` reuse not planned
  5. Existing tests (`block-crud.test.ts`, `publish-flow.test.ts`, `site-blocks-crud.integration.test.ts`) — plan says they pass "unchanged" but doesn't verify they don't import or reference replaced components

- [x] **Best solution with trade-offs explained** — Risk mitigation table covers the major risks (Puck + React 19, Monaco bundle size, translation layer bugs, onChange frequency, custom shell breakage on Puck updates). Trade-offs between mock preview vs. real iframe preview are acknowledged.

- [x] **Prioritized long-term maintainability** — Incremental phasing (5 phases, each its own PR) is excellent for maintainability. Translation layer as a pure function (`rowsToPuckData`, `diffPuckData`) is testable and isolated.

### Security & Safety

- [~] **No security vulnerabilities introduced** — The plan itself doesn't introduce direct vulnerabilities since API routes are unchanged and auth stays the same. **However:** two pre-existing gaps are relevant:
  1. **No CSRF protection** on admin app — cookie-based sessions without CSRF tokens. Puck's onChange triggers state-changing POSTs/PUTs to the API. While requirePlatformAdmin() validates the session, a CSRF attack could trick an authenticated admin's browser into making these calls. **This is a pre-existing issue, not introduced by the plan**, but the plan should acknowledge it.
  2. Phase 3's editable page JSON (`PageJsonEditor.tsx`) accepting arbitrary JSON and dispatching to Puck state could allow injection of malicious content if not validated against the block content schemas.

- [~] **Input validation and sanitization added** — Existing `validateBlockContent()` covers the publish path. **Gap:** Phase 3's page JSON editor allows direct JSON editing that bypasses the field-level editors. The plan should specify that JSON edits are validated through `validateBlockContent()` before being accepted, not just on publish.

- [x] **Authentication/authorization properly handled** — All API routes use `requirePlatformAdmin()` which validates Supabase session + `platform_admin_users` table + `super_admin` role. This is unchanged.

- [x] **Sensitive data protected** — No new sensitive data is introduced. Block content is non-sensitive (public site content). No API keys are stored client-side (Phase 4's Anthropic API key would be server-side only).

- [~] **OWASP guidelines followed** — Mostly. **Missing:**
  1. **A5:2017 Broken Access Control** — No CSRF tokens on admin app (pre-existing, not new)
  2. **A7:2017 XSS** — Phase 3's JSON editor could inject script if content reaches public site unescaped. The existing `TextBlock.tsx` uses DOMPurify for markdown content, which is good. Verify that all block content rendering in the public site sanitizes output.
  3. **No CSP headers on admin app** — The admin app has no Content-Security-Policy. While this doesn't block Puck/Monaco CDN loading, it's a security gap. The web app has CSP via `buildCspHeader()` in `security-headers.ts`, but the admin app has none.

### Integration & Testing

- [~] **All upstream/downstream impacts handled** — The component dependency tree is clean:
  ```
  SiteBuilderPage → SiteBuilderLayout → BlockEditor + PreviewPanel
  ```
  Only `SiteBuilderLayout.tsx` imports `BlockEditor` and `PreviewPanel`. No other components reference them. API routes are unchanged. **However:** existing tests (`block-crud.test.ts`, `publish-flow.test.ts`) test validation logic from `@propertypro/shared/site-blocks` — these should pass unchanged. The integration test (`site-blocks-crud.integration.test.ts`) tests API routes directly — also unchanged. But this should be explicitly verified, not assumed.

- [~] **All affected files updated** — Plan lists 4 modified files. **Missing:**
  1. `PreviewPanel.tsx` — becomes dead code, should be deleted or scheduled for deletion
  2. Existing test files — need to be confirmed passing (not just assumed)
  3. `apps/admin/src/app/clients/[id]/site-builder/page.tsx` — plan says to "pass theme data to layout" but doesn't specify what changes

- [x] **Consistent with valuable patterns** — The admin app uses raw `fetch()` + `useState` (no TanStack Query). The plan's translation layer follows this pattern. Auto-save with debounce via `useRef` matches the existing `BlockEditor.tsx` pattern. Error display using inline red boxes matches the existing `ClientPortfolio.tsx` pattern.

- [x] **Fully integrated, no silos** — The translation layer (`translate.ts`) bridges Puck ↔ API, ensuring the new editor is fully integrated with the existing data flow. No parallel data stores or shadow state.

- [~] **Tests with edge cases added** — Plan mentions tests in Phase 5:
  - `translate.test.ts` — round-trip conversion, edge cases
  - `puck-config.test.ts` — config validation

  **Issue:** Translation layer tests should ship in Phase 1 (when the code ships), not Phase 5. Deferring tests to a later phase means the most complex new code (the translation layer) ships untested. Edge cases to cover:
  - Empty block list (no blocks yet)
  - All 7 block types in a single page
  - Draft + published blocks coexisting
  - Blocks with `deleted_at` set (soft-deleted)
  - Content with special characters, empty strings, max-length values
  - Reorder with only 1 block (no-op)
  - Rapid add → edit → delete sequence

### Technical Completeness

- [~] **Environment variables configured** — The plan doesn't mention any new env vars. Phase 1 (Puck only) likely doesn't need new env vars since `@puckeditor/core` is a client-side library. **Phase 3 (Monaco):** `@monaco-editor/react` loads Monaco from jsDelivr CDN by default. If a CSP is added to the admin app (recommended), a `MONACO_CDN_URL` env var or CSP allowlist entry will be needed. **Phase 4 (AI):** Will need `ANTHROPIC_API_KEY` as a server-side env var.

- [x] **DB / Storage rules updated** — Correctly, no DB changes needed. The plan preserves the existing schema, RLS policies (via Supabase admin client), and storage configuration. No new tables, columns, or indexes.

- [~] **Utils and helpers checked** — The plan should extract two utilities from `BlockEditor.tsx` before or during Phase 1:
  1. `extractApiError(res: Response): Promise<string>` (lines 54-74) — currently inlined, will be needed in PuckEditor
  2. `ConfirmDialog` component (lines 278-334) — currently inlined, will be needed for publish/discard confirmations

  Without extraction, PuckEditor will either duplicate this code or miss these behaviors.

- [~] **Performance analyzed** — The plan's Risk Mitigation table covers Monaco bundle size (~3MB, lazy-loaded) and Puck onChange frequency (1000ms debounce). **Missing:**
  1. **No admin bundle budget exists.** The web app has performance budgets in `scripts/perf-check.ts` (200KB warning, 700KB hard limit per route). The admin app has none. Adding Puck (~150KB) + Monaco (~3MB lazy) without a budget means no guardrails. The plan should either: (a) add `pnpm perf:check` coverage for admin, or (b) document expected bundle impact and accept the risk.
  2. **Translation layer diffing cost** — `diffPuckData()` does a full deep comparison on every debounced onChange. For typical page sizes (5-15 blocks), this is fine. For edge cases (30+ blocks with large content objects), it could cause jank. The plan should document the expected upper bound.

---

## Updated Verdict

The plan is architecturally sound and the phased approach is correct. **4 critical issues** must be fixed before implementation. **6 significant concerns** should be discussed and either addressed or consciously deferred. The security posture is acceptable for Phase 1 (no new attack surfaces) but Phases 3-4 introduce concerns (JSON injection, API key management) that need explicit mitigation.

**Proceed with revisions.** Estimated effort to address critical issues: 1-2 hours of plan revision, no architectural changes needed.

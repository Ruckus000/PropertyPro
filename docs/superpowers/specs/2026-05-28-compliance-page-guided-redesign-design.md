# Compliance Page — Guided Redesign (Design Spec)

**Date:** 2026-05-28
**Status:** Approved design, pending implementation planning
**Route:** `/communities/[id]/compliance`
**Scope:** UI structure only. No backend, API, data-model, RBAC, or regulatory-copy changes.

---

## 1. Why this exists

The current compliance page is a data-display surface (a 6-column table + a sticky
detail panel + four equal-weight KPIs + a CAM/Board mode toggle). A UX audit plus
live testing surfaced two classes of problem:

1. **A critical layout bug:** the queue table renders at its intrinsic width (~944px)
   regardless of the container, overflowing or hiding behind the detail panel. The
   per-row action button (Upload/Link) is off-screen or occluded at every tested
   viewport (375, 1024, 1280, 1440px). Verified via live DOM measurement.

2. **A deeper UX problem:** the page is organized around *displaying data* rather than
   *guiding work*. It assumes the reader already understands the domain (statute refs,
   posting windows, visibility scopes). Primary users include non-expert volunteer
   board members who cannot decode an expert table into action.

This spec rethinks the page from the job-to-be-done rather than patching the table.

## 2. Who this is for and what they're doing

- **Audience:** compliance officers, community association managers (CAMs), and board
  members — treated as **one audience** with permissions (`canWrite`) gating what they
  can *do*. The previous CAM-view/Board-view mode toggle is removed; user research
  decision is that the two roles share the same job with different emphasis, not
  different views.
- **Expertise level:** **assume non-expert.** The page teaches as it goes — plain
  language first, statutory detail one tap away.
- **Primary job (decided):** *both* monitor status **and** act, but **lead with risk** —
  land on overall health and the single most urgent item, and make acting on it one
  click.

## 3. Design pillars

1. **Lead with risk.** The page opens with a plain-language verdict ("2 records are
   overdue — these can expose the association to penalties") and a CTA pointing at the
   worst item. Not four equal KPIs.
2. **One audience, permissions gate actions.** No mode toggle. `canWrite` controls
   which action buttons render.
3. **Teach aggressively / guided.** A table is the wrong instrument for non-experts.
   Each requirement is a guided card: *what it is, why it matters, what to do.*
4. **Done = reassurance, secondary.** Two zones: "Needs you" (loud, prioritized) and
   "Done" (calm, collapsed, de-emphasized).
5. **Guided cards at all widths.** One card component from 375px to ultrawide. No table
   at any breakpoint — which means the overflow bug cannot return.

## 4. The core architectural move

**Replace the table AND the separate sticky detail panel with a single guided,
expandable requirement card.** Everything about one requirement lives in the card,
progressively disclosed.

**Collapsed state** (default):
- Status pill — icon + text + escalation color (overdue / due-soon / action-needed /
  needs-board-action / satisfied). Never color alone.
- Plain-language title (e.g., "Conflict of Interest Contracts").
- One-line plain-language "why it matters."
- Primary action button (Upload, or Link existing, per `resolveComplianceCta`).
- Expand affordance.

**Expanded state** (adds, in place):
- Status checks: "Document on file", "Posted to owner portal", "Audit trail recorded"
  (absorbed from the retired detail panel).
- Expert detail: statute reference, posting window, deadline, visibility scope.
- Per-item recent activity (last few audit entries for this requirement).
- Full action row: Upload / Link existing / Mark N/A / View / Mark Applicable, gated by
  status and `canWrite`.

This single decision eliminates: the 6-column overflow bug, the "click row → scroll to
find the detail panel" problem, the off-screen Upload button, the CAM/Board toggle, the
sticky panel, and any need for a Sheet/Drawer for detail.

## 5. Page structure, top to bottom

1. **Header.** Title "Compliance" + breadcrumb (`Communities / Compliance`). Page
   actions:
   - **"Upload record"** → opens the existing `UploadDocumentModal` for an *unattached*
     general document (no preselected checklist item). Repurposed from its current dead
     state.
   - **"Export readiness report"** → **gated behind a feature flag** until a real PDF
     backend exists. Never ships as a no-op. (See Open Questions.)
2. **"Where you stand" hero** (new `ComplianceStatusHero`). Replaces the generic
   warning banner + four equal KPIs as the lead. Severity-driven verdict:
   - Overdue > 0 → **danger** framing + "Start here" CTA jumping to the worst item.
   - Due-soon only → **warning** framing.
   - All clear → **success**: "You're fully compliant. Nothing needs attention right
     now."
   - Readiness shown as a **meter**, not a bare number.
   - Uses `lucide-react` icons (not the bespoke `!` glyph).
3. **Compact metric strip** (reference, de-emphasized). The four numbers (readiness,
   posting windows due soon, overdue, needs board action) survive here as supporting
   context — with an icon on alert-tone metrics (no color-alone).
4. **"Needs you" zone.** Guided expandable cards, sorted overdue → due-soon →
   action-needed → needs-board-action (via existing `sortByPriority`). Filter chips
   scope this zone (Action needed / All / Overdue / Due ≤ 7 days). Single Clear-filters
   affordance (no duplicate).
5. **"Done" zone.** Collapsed by default: "You're caught up on N records ⌄". Expands to
   muted, calm cards. Each still openable to view or unlink the posted document.
6. **Activity feed** (audit trail). At the bottom; entry body promoted to `text-sm`
   (currently `text-xs`, which violates the design system's metadata-only rule for 11px).
7. **Modals.** Upload/Link flows unchanged except modal width standardized to the
   design-system `md` (560px).

## 6. Components

| Component | Fate | Notes |
|---|---|---|
| `compliance-queue.tsx` | **Retire** | Replaced by a zone-grouping list renderer. |
| `compliance-detail-panel.tsx` | **Retire** | Content absorbed into the card's expanded state. |
| `compliance-checklist-item.tsx` | **Evolve → `ComplianceRequirementCard`** | Already has collapse/expand + "What's required?" help text; the foundation of the new card. |
| `compliance-item-actions.tsx` | **Fold into card** | The Upload/Link/N/A/View/Mark-Applicable button row, all design-system `Button`. |
| `compliance-command-center.tsx` | **Rework** | Hero + metric strip + two zones. Remove toggle, grid, sticky panel, localStorage. |
| `ComplianceStatusHero` | **New** | Plain-language risk verdict + readiness meter + jump-to-worst CTA. |
| `ComplianceActivityFeed` | **Keep** | `text-sm` readability fix. |
| `KpiCard` | **Repurpose → metric strip** | Add icon support for alert tone. May be promoted to `packages/ui` (see Open Questions). |
| `UploadDocumentModal` / `LinkDocumentModal` | **Keep** | Width → `max-w-[560px]`. |

### Isolation / interface notes
- `ComplianceRequirementCard` is a pure presentational component: takes a
  `ChecklistItemData`, `canWrite`, `role`, an `expanded` flag (or owns its own expand
  state), and action callbacks. It must not own data fetching.
- CTA resolution stays centralized in `resolveComplianceCta` so the card and any future
  surface can never drift.
- Zone grouping (Needs you vs Done) and sorting live in the list renderer / command
  center, not in the card.
- `ComplianceStatusHero` takes the computed `summary` (from `buildComplianceSummary`)
  and an `onJumpToWorst` callback; it owns no data fetching.

## 7. Data flow

- Source of truth stays in `ComplianceCommandCenter`: `useComplianceChecklist(communityId)`,
  `useComplianceMutations(communityId)`, `selectedId`, `filter`.
- `buildComplianceSummary` feeds the hero and metric strip.
- `sortByPriority` + status predicates partition items into "Needs you" vs "Done" and
  order the worklist.
- Expansion is card-local UI state (or a single `expandedId` in the command center if we
  want accordion behavior — implementation plan to decide; default to independent
  per-card expand).
- Action dispatch shares one path through `resolveComplianceCta` → the existing mutation
  handlers (`onUpload`, `onLink`, `onView`, `onMarkApplicable`).

## 8. Error, loading, empty states (design-system requirement: all four states)

- **Loading:** skeleton hero, skeleton metric strip, skeleton cards during `isLoading`
  (replaces the current "Loading…" text and the KPI zero-flash).
- **Error:** page-level `AlertBanner status="danger"` with a Retry action wired to the
  query's `refetch` (replaces the inline error block).
- **Empty — fully compliant:** the hero's success state carries the message; the
  "Needs you" zone shows an encouraging empty state ("You're all caught up").
- **Empty — filtered to nothing:** "No records match this filter" + Clear filters.

## 9. Accessibility

- Every interactive affordance (card expand toggle, action buttons, filter chips, hero
  CTA) shows the `:focus-visible` ring; never suppressed.
- Touch targets: 44px mobile / 36px desktop — achieved by using the design-system
  `Button` (sm = 36px) and sizing chips/toggles accordingly.
- Status always icon + text + color, never color alone (hero, metric strip, card pills).
- `aria-expanded` on the card expand control; `role="alert"` on the error banner;
  decorative icons `aria-hidden`.
- Body/guidance text floor 16px (`base`); 11px (`xs`) reserved for metadata/timestamps.

## 10. Phasing (each phase = its own implementation plan + PR)

- **Phase 1 — `ComplianceRequirementCard`.** Build the guided expandable card in
  isolation, consolidating `compliance-checklist-item`, `compliance-item-actions`, and
  the detail-panel status checks. Unit-tested standalone; CTA parity with
  `resolveComplianceCta`.
- **Phase 2 — Page assembly.** `ComplianceStatusHero`, metric strip, "Needs you" +
  "Done" zones; wire the card; retire `compliance-queue` and `compliance-detail-panel`;
  remove the CAM/Board toggle and its state. This is where the page visibly transforms.
- **Phase 3 — States & a11y polish.** Loading skeletons, activity-feed readability,
  error `AlertBanner`, focus rings, touch targets, modal width.

## 11. How the original 20 audit findings resolve

All 20 priority findings (F-01–F-20) are accounted for below (20 total):

- **Dissolved by removing the table (7):** F-01, F-02, F-09, F-10, F-16, F-17, F-18.
- **Dissolved by removing toggle/sticky panel (2):** F-14, F-15.
- **Resolved by component consolidation (1):** F-11.
- **Absorbed into the hero (2):** F-12 (severity escalation), F-19 (lucide icon).
- **Resolved by the new state handling (2):** F-07 (loading skeletons), F-08 (empty
  states for the zones).
- **Carried forward as polish on the new structure (4):** F-04 (focus rings, incl. the
  new card affordances), F-05 (activity text-sm), F-06 (touch targets), F-13 (metric
  icon).
- **Product decision (1):** F-03 — Upload record repurposed; Export readiness report
  gated behind a flag.
- **Open question (1):** F-20 (KpiCard promotion to `packages/ui`) — see Open Questions.

Additionally folded in from the audit's recommendation set (not among the 20):
**SF-5** (replace inline error block with `AlertBanner`) and **PF-3** (standardize
upload-modal width to 560px), both in Phase 3.

## 12. Testing strategy

- **Phase 1:** unit tests for `ComplianceRequirementCard` — collapsed/expanded
  rendering, correct CTA per status via `resolveComplianceCta`, action callbacks fire,
  status checks render, `canWrite=false` hides write actions.
- **Phase 2:** unit tests for `ComplianceStatusHero` (danger/warning/success verdicts),
  zone partitioning (Needs you vs Done), filter scoping. Snapshot the assembled page in
  loading/error/empty/success.
- **Phase 3:** skeleton render test; error-banner Retry wiring; focus-ring presence
  assertions where testable.
- **Cross-cutting:** existing tests for retired components are removed with the
  components; `compliance-pill-mapping.test.ts`, `compliance-activity-feed.test.tsx`,
  and any `resolveComplianceCta`/`compliance-calculator` tests must continue passing.
- **Manual verification:** preview tool at 375 / 768 / 1024 / 1280 / 1440 — confirm the
  primary action is reachable in one click, no horizontal page overflow, hero verdict
  matches data, zones collapse/expand cleanly.

## 13. Non-goals

- No backend or API changes; all findings are UI-only.
- No data-model changes; no new audit-log event types.
- No regulatory/legal copy changes.
- No RBAC/permission/feature-flag logic changes (the Export flag is a simple gate, not a
  permissions change).
- Out of audit scope and not addressed here: design-system color audit, dark-mode
  review, internationalization.

## 14. Open questions

1. **Readiness PDF export.** Is there an existing or planned backend for "Export
   readiness report"? If yes, Phase 3 can wire it; if no, it stays behind a flag. The
   spec assumes *gated/flagged* until told otherwise.
2. **`KpiCard` promotion.** Promote `KpiCard` to `packages/ui` (cross-package change,
   reusable elsewhere) or keep it local to the compliance feature? Spec assumes local
   unless a second consumer is identified.
3. **Card expand model.** Independent per-card expand (multiple open) vs accordion (one
   open at a time)? Spec defaults to independent; implementation plan to confirm against
   usability.

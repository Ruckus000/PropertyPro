# Empty states, "guided blueprint": build plan

Status: **approved 2026-11-20** (all nine phases P0–P8; Q2 → a separate session; Q3 → per-browser dismissal). Nothing built yet.
Source of truth: [`docs/design-system/patterns/empty-states.md`](../../design-system/patterns/empty-states.md) (the spec),
[`docs/audits/2026-11-11-empty-state-design-audit.md`](../../audits/2026-11-11-empty-state-design-audit.md) (the audit),
canvas <https://claude.ai/artifact/H2DDrAFquaiRAKL6NrNr8N>.

Planned the ponytail way: every place a change reaches is listed before the change is chosen, each piece
takes the lowest rung that works (reuse, then platform, then minimum new code), and nothing on a trust
boundary, data-loss path or accessibility requirement is cut. Shortcuts carry this repo's
`ponytail: <limit>. Trigger: <observable>` marker.

---

## 1. Decision ledger (normative)

An implementer who disagrees files a finding in the PR; they don't stop and re-ask.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Where the illustration kit lives | `packages/ui/src/illustrations/`: one component per part, one per composition, each taking `size: 'hero' \| 'section' \| 'compact'`. They are re-exported from `packages/ui/src/index.ts`. There is no new tsup entry. | The spec places it there. Tree-shaking already works because the package declares `sideEffects: ["**/*.css"]`. A new entry would add config and buy nothing. |
| D2 | How illustrations are painted | SVG presentation attributes `fill="var(--teal-50)"` and `stroke="var(--sand-300)"`, palette tokens only. No Tailwind `fill-*` classes. The art box is sized in rem and the `viewBox` scales inside it. Every svg gets `aria-hidden="true" focusable="false"`. | Attributes never pass through Tailwind, so they can't silently emit zero CSS. `guard:class-resolution` can't see `fill-[var(--x)]` classes anyway. |
| D3 | Hex can't sneak into the kit | Add a root `{ dir: 'packages/ui/src/illustrations', only: ['raw-hex', 'raw-palette', 'arbitrary-color'] }` to `scripts/verify-design-tokens.ts`. Today `packages/ui/src` gets only `bare-focus-ring` and `arbitrary-font`, so a hex fill there passes every guard. Verify it three ways: green on the real tree, red on an injected `fill="#fff"`, and a non-zero file count. | This reuses the house guard rather than writing a new test. |
| D4 | Kit size | Build the landscape, the marks and only the props the shipped phases use. Each later prop lands in the PR of the page that first needs it, following the spec's rule of at most one new prop per screen. | The spec's ~25 props up front would be unused code until phase 7. |
| D5 | EmptyState API | **Extend, don't replace.** Add sizes `hero \| section \| compact` alongside the existing `sm \| md \| lg`, plus three new props: `illustration?: ReactNode`, `eyebrow?: string` and `aside?: ReactNode` (the hero's context column). Heading level follows size: hero `h2`, section `h3`, compact `p`. `sm`, `md` and `lg` render byte-identically. | 20 files in `apps/admin` use `sm`, `md` and `lg`, and the spec covers `apps/web` only. Marked `ponytail: sm/md/lg kept for apps/admin's call sites. Trigger: admin adopts scenes, or no web caller passes sm/md/lg.` |
| D6 | The spec's `state` prop | **Not added.** Waiting, All clear and No results differ only in whether there is an illustration or an action. Error stays `AlertBanner`; Loading stays `Skeleton`. A prop that changes nothing is a config nobody sets. | This deviates from spec §8 ("EmptyState gains size + illustration + state"). The rest of that line ships as written. |
| D7 | Where SetupGuide lives | `apps/web/src/components/shared/setup-guide/`, made of `SetupGuide`, `SetupRail`, `SetupSlot`, `ContinueSetupBar` and `ContextSection`. | Only web uses it, so `packages/ui` stays smaller and admin is untouched. |
| D8 | Accent colour in the chrome | The current-step marker, the next slot's border and tile, and the progress ring use `interactive` (`--interactive-primary`). The art uses fixed palette tokens. | `--interactive-primary` is `var(--theme-primary, var(--coral-600))`, and the authenticated layout applies the community theme. A fixed coral marker would clash with a themed blue primary button. By default it is exactly the spec's coral-600. |
| D9 | Uploading into a slot | Reuse `UploadDocumentModal` (`components/compliance/upload-document-modal.tsx`), which uploads with `skipAutoLink`, then `PATCH /api/v1/compliance` `link_document`. This is the same two-call pattern Compliance and the website drawer already use. **No API change.** | Rung 2 of the ladder: an existing component used the way its neighbours use it. |
| D10 | "Doesn't apply to us" | Reuse `NotApplicableDialog` (`components/website-home/records/not-applicable-dialog.tsx`, fixed reasons plus a note of up to 200 characters) and `useComplianceMutations().markNotApplicable`. The gate is `compliance:write`. **It asks for a reason**, which settles audit O-4 by reuse. | This closes the in-page half of F-8 and draws no new dialog. |
| D11 | Condo and HOA steps | Steps come from template data, never from a hard-coded list. Each item maps through its `category` (plus `documentCategory` to split `operations`) to the spec's five groups. Condo: Governing → Money → Meetings → Board, insurance & contracts → Building. HOA collapses the empty groups. The rows are `compliance_checklist_items`. Progress counts only applicable items: `isApplicable && !deletedAt`. | Spec rule 8 and audit C-1, H-2. |
| D12 | Apartment Documents | The community's own categories become a **recommended starter set**: a "Folders set up" step pre-checked, then "Resident essentials". That second step holds the categories tenants can open, read from the same access policy the documents API applies, not from a list of names. After it come the remaining categories. No statute, no "required", no count against a law. | Audit C-1. |
| D13 | "Upload several" on the condo board | It opens the existing multi-file `DocumentUploadQueue` unchanged. Auto-link then links any upload with exactly one match. **Choosing a slot per file is not built** (audit §5.2 lists it as new UI). | `ponytail: multi-upload files a slot only on an unambiguous match. Trigger: managers re-link more than ~1 in 5 multi-uploaded files by hand.` The per-file picker is its own task and separate PR (user, 2026-11-20); it changes only the upload queue, which this plan leaves untouched. |
| D14 | Dismissing "Continue setup" | Per user and community in `localStorage` (key `propertypro:setup-dismissed:{surface}:{communityId}`), following the compliance-onboarding precedent. Setup stays reachable from the page's overflow menu. | `ponytail: dismissal is per browser, not per account. Trigger: a manager reports the bar coming back on another device.` Confirmed by the user 2026-11-20 over a per-account route on `user_preferences`. |
| D15 | Which open gaps this work closes | **In:** F-1, F-2, the UI half of F-3, F-4 (Directory phase); F-6, the in-page F-8, F-10 (Compliance); F-11 (Meetings); F-14 (Announcements, which points urgent news to Emergency); R-8 (Compact sweep: **delete** `DashboardViolations`, `DashboardMeetings`, `no_maintenance_requests` and `no_esign_pending` rather than redesign dead code). **Out:** F-12 (meeting attachments UI is new UI for an existing API, not an empty state; filed as a follow-up). | Every "in" item is the redesign's own outcome on that page. |
| D16 | F-10 (`compliance_empty` unreachable) | With zero checklist rows, the Compliance page calls `ensureTransparencyChecklistInitialized` server-side, which is what the website home already does on first visit. The `compliance_empty` preset is then deleted. | PM-created communities *do* get rows, via `initializeNewCommunityRecords`, but best-effort. A survey agent claimed otherwise and was checked against the code. |
| D17 | Grouping on the Compliance day-zero view | Precedence: conditional first ("Only if they apply"), then `deadline` ("Due <date>"), then `rollingWindow` ("Keep current, rolling 12 months"). Below the unit threshold, where `postingClockApplies` is false, no countdown copy appears. F-6's banner is gated off until a record is actually overdue or due within 7 days. | The buckets overlap in data (3 + 3 condo conditional items carry a deadline or a window). |
| D18 | Storm notice | `STORM_DAMAGE_DISCLAIMER` renders verbatim, outside every state branch, as a full-width `role="note"` amber callout under the hero. A new test asserts its exact text is in the DOM in the empty, waiting and populated states. | It is legal copy. Today nothing tests that it is visible. |
| D19 | Toolbar while empty | While a page is in Setup, its own primary ("Upload Document", "Add unit") is hidden and the hero owns the action. Secondary items stay as `outline` or `ghost`. In Partial the page primary returns and "Continue setup" is `outline`. | Spec §4.1, §4.3; audit H-3. |
| D20 | No results is not empty | Every list that has both cases branches on "filters or search active" before choosing a state. First fix: Documents (`documents-table.tsx:232`, `documents-timeline.tsx:50-56`). | Audit M-9. |

## 2. Where the change reaches

Listed before choosing pieces, per ponytail.

- **`packages/ui` EmptyState** is used by 46 web files (13 presets, via the web wrapper) and **20 admin files**
  (directly). Any visual change to `sm`, `md` or `lg` reaches admin, so D5 keeps them byte-identical. Tests: the
  `packages/ui` suite **and** `pnpm --filter @propertypro/admin exec vitest run`.
- **Presets** (`lib/constants/empty-states.ts`) are asserted by copy in six test files:
  `dashboard-sections`, `compliance-command-center`, `package-resident-view`, `payment-portal`,
  `resident-arc-requests` and `announcement-list`. Each phase updates the tests for the pages it touches.
- **E2E**: `demo-flows.spec.ts:275-299` matches "no documents yet|build your document library", so the
  Documents phase updates it (and its stale comment). `responsive-overflow.spec.ts` already covers
  documents, compliance, meetings and announcements at 375–1440, and must stay green.
- **Guards that apply**: `guard:design-tokens` (with D3), `guard:class-resolution` (scans
  `packages/ui/src` too), `guard:page-padding` (no root `px` on pages), `guard:page-header` (no `<h1>`;
  `document-library.tsx` and `meetings-page-shell.tsx` are page shells; the hero is `h2`),
  `guard:breadcrumbs`, `guard:legacy-roles` and `guard:service-dead-exports` (R-8 deletions ratchet the
  baseline in the same PR).
- **Help links** go only to articles that exist under `apps/web/src/content/help/`. The paths are already
  surveyed for documents, residents, meetings, announcements, storm and compliance.
- **Data**: no migrations. Every write goes through an existing route (`documents` POST,
  `compliance` PATCH, `units` POST, `import-units`, `import-residents`, `residents/invite`, `meetings`,
  `announcements`, `storm-damage`). `git diff --name-only origin/main -- packages/db | wc -l` must be 0
  in every phase.
- **Exposure check**: setup views show only what the viewer's existing GET already returns. Tenants have
  no `compliance:read`, so a tenant never sees checklist counts. Resident waiting states show no counts
  at all (spec §4.4).

## 3. Phases

Each phase is one PR to `main`, merged in order: P0 → P1 → P2, then P3–P6 in any order, then P7 → P8.
File sets are disjoint across P3–P6, so those four can run as parallel sessions once P1 is merged.

| Phase | What ships | Files (owner) | Blast radius |
|---|---|---|---|
| **P0 Kit + sizes** | Illustration parts (ground, sun, cloud, palm, building with its door and window grid; marks: plus disc, done disc; a decorative progress ring) plus the props P2–P4 use (drawer, document, clipboard, camera). The other props land with the page that first needs them (D4). Compositions: `DocumentsScene`, `DirectoryScene`, `StormCalmScene`. EmptyState `hero`, `section` and `compact`, plus the D3 guard root. The web wrapper passes the new props through. | `packages/ui/src/illustrations/**`, `packages/ui/src/components/shared/empty-state.tsx` (+ test), `packages/ui/src/index.ts`, `apps/web/src/components/shared/empty-state.tsx`, `scripts/verify-design-tokens.ts` | RENDER (both apps; admin visually unchanged) |
| **P1 SetupGuide** | `SetupGuide` (hero 7/5, rail, main/context 8/4, one 24px inset, 16px below `md`), `SetupRail` (spec §6.3 markup), `SetupSlot`, `ContinueSetupBar`, `ContextSection`. No page uses them yet. | `apps/web/src/components/shared/setup-guide/**`, axe + unit tests | INTERNAL |
| **P2 Documents** | Condo, HOA and apartment setup; the partial bar; the resident waiting hero; the no-results split (D20); slot upload (D9); not-applicable (D10). A pure `lib/documents/setup-model.ts` builds steps and counts from rows. | `components/documents/document-library.tsx`, `documents-table.tsx`, `documents-timeline.tsx`, new `components/documents/documents-setup.tsx`, `lib/documents/setup-model.ts`, `demo-flows.spec.ts`, presets `no_documents*` | RESIDENT-APP |
| **P3 Directory + Leases** | Units → Residents (disabled with the reason until a unit exists) → Invitations; apartments add Leases. The CSV slot shows the real columns and template rows (`unit-csv-validator.ts:41`, a 2,000-row cap). The overview strip is hidden until a unit exists. Leases with zero units links to Directory setup instead of "No units on record." Fixes F-1 to F-4. | `components/directory/**`, `components/residents/resident-form.tsx`, `components/leases/roster/LeaseRosterPage.tsx`, preset `no_residents` | RESIDENT-APP |
| **P4 Storm damage** | Manager setup (2 steps; the six real report fields; the real statuses), resident waiting state with "Report damage", and D18. | `components/storm-damage/**`, presets `storm_damage_*` | RESIDENT-APP |
| **P5 Compliance first run** | The calm 30-day countdown (D17), the in-page "doesn't apply" control, D16, and the F-6 banner gate. | `components/compliance/compliance-command-center.tsx`, `compliance-onboarding.tsx`, `communities/[id]/compliance/page.tsx`, `lib/utils/compliance-calculator.ts` (banner gate only), preset `compliance_empty` (deleted) | RESIDENT-APP |
| **P6 Meetings + Announcements** | Meetings: Schedule → Post the notice → Minutes, with types grouped by notice period. The first-run signal is the all-time count, not the month (F-11). Announcements: a single action, the composer's real fields, three suggested first posts (copy only), and a link to Emergency. An Emergency nav item is added (F-14). | `components/meetings/meetings-page-shell.tsx`, `meeting-schedule.tsx`, `components/announcements/announcement-list*.tsx`, `components/layout/nav-config.ts` (+ its test) | RESIDENT-APP |
| **P7 Remaining hero pages** | E-sign (requests, templates), Insurance (master policy, wind mitigation), Amenities, Vendors, Assessments, PM Communities; the resident waiting and all-clear states for Packages, Payments, Maintenance, ARC and Report a problem. | each page's own component, one sub-PR per family if a diff exceeds ~600 lines | RESIDENT-APP |
| **P8 Section + Compact sweep** | Board polls, forum, elections, minutes, join requests, operations hub, reserves, audit trail; dashboard widgets, the notification dropdown, the upload queue and every `DataTable emptyMessage`; the ad-hoc "No … yet" strings; R-8 deletions; unused presets removed. | the remaining callers | RENDER |

**Not built (named so they don't hide):** choosing a slot per file in multi-upload (D13), per-account
dismissal (D14), a floor-by-floor unit builder (O-5), the meeting attachments UI (F-12), any shortening of
the storm notice (O-1), bulk auto-link on Documents (O-2), and scenes for `apps/admin`.

## 4. Tests and checks, per phase

Done means a named command was run **and its output read**; a passing exit code alone doesn't count.

1. **Unit.** `pnpm --filter @propertypro/ui exec vitest run` (whole package), and for P0 also
   `pnpm --filter @propertypro/admin exec vitest run`. For web: `pnpm test <path>` (no `--`).
   - The non-trivial logic gets direct tests: `setup-model.ts` (applicable-only counts, step grouping
     per type, apartment starter set), the D17 bucket precedence, the D20 state choice, and the first-run
     signal in P6.
2. **Axe** (`vitest-axe` in `apps/web/__tests__/accessibility/`, since packages/ui has no axe dependency and
   none is added). Every case first asserts that a named element rendered: the `h2`, the rail's `nav`, a
   slot button by name. Then one **anti-vacuity probe per case**, e.g. drop a slot's `aria-label` and
   show `button-name` goes red while the sibling cases stay green.
3. **Revert-check**, named in each commit message. Delete one production line and show the named test
   reddens for the stated reason. Planned targets:
   - P2: the `isApplicable` filter in `setup-model.ts` ("4 of 13" becomes "4 of 21").
   - P2: the filter-active branch (empty shows "No results").
   - P3: the units-exist check on the Residents step.
   - P4: the disclaimer render.
   - P5: the conditional-first precedence.
   - P6: the all-time first-run check.
4. **Guards.** `pnpm lint` (all 34 guards), `pnpm typecheck` (including `scripts/`), and
   `git diff --name-only origin/main -- packages/db` returning nothing.
5. **Browser.** Use the agent sandbox only, never prod.
   - First count running Supabase stacks (≥4 means ask before starting a fifth), rebuild
     `@propertypro/ui`, and confirm the dev server's PID cwd is this worktree.
   - Setup states need **fresh** communities, because the seeded demo communities already hold
     documents and units. Create them with `pnpm agent:fixture:community -- --type condo_718|hoa_720|apartment`
     (`agent-*` slugs, `@agent.local` roots).
   - Partial and waiting states come from the seeded `root_sunset`, `root_sunsetridge`, `owner` and `tenant`.
   - Each surface is checked at **1440×900 and 375×812** with large text on (the default), on all three
     types. Before/after screenshots go in the PR.
6. **Review gate.** Before each push, run a ponytail-review-style independent review: a subagent that gets
   the diff, not my conclusions. Every finding must name a concrete case. Also run a security pass over any
   new write path (none are planned).
7. **CI.** The seven required checks must be green on the PR head before merge. I commit, push or merge
   only when asked.

## 5. Risks

- **Large-text sizes and the fluid root.** The boards are drawn at standard text size at 1280. The real
  page renders one step larger and grows to 20px root at 1856. The 1440 check is the one that matters.
- **Documents is a page shell for `guard:page-header`.** One stray `<h1>` in the hero fails lint.
- **Admin drift.** If D5's byte-identical claim breaks, admin changes silently. The admin suite plus a
  snapshot of the `sm`, `md` and `lg` class strings guards it.
- **Checklist rows missing.** The P2 setup depends on checklist rows, and their creation is best-effort.
  The Documents page therefore calls `ensureTransparencyChecklistInitialized` server-side, the same call
  D16 adds to Compliance and the website home already makes. It is idempotent and inserts only missing
  rows. If that call fails, the slots render disabled with a line saying the record list couldn't load,
  plus Retry. The page never shows a count it can't back.

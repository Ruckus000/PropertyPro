# Community Dashboard Redesign Implementation Plan (revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the condo/HOA dashboard into an urgency-first overview (plain-language status, one sorted "Needs attention" list, this week, quick actions, metrics), mostly by reusing what already exists. Then add top-tab navigation behind a flag that stays off.

**Architecture:** Wave 1 adds one fail-soft loader (`loadDashboardOverview`), four small pure builders and five server components, and composes them in `dashboard/page.tsx`. It keeps the existing signature, announcement, onboarding, website and activity components. Wave 2 adds a tab row built from nav-config's existing `navTier` and `NAV_SECTIONS`, behind `NEXT_PUBLIC_TOP_NAV_ENABLED`. It shares the rail's badge hook and upgrade dialog, and the rail itself stays for the phone drawer and the site editor.

**Tech Stack:** Next.js 15.5 App Router (RSC, Suspense) · React 19 · Tailwind semantic tokens · Radix Popover · Drizzle via `createScopedClient` · Vitest (node + jsdom) · Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-community-dashboard-redesign-design.md` (revision 2). Its **ledger D1–D30 is normative**, §4/§5 copy is exact, and §7 lists what is deliberately not built. An implementer who disagrees files a finding and does not stop to ask.

## Global Constraints

- **Ponytail ladder on every step:** does it need to exist, then already in the repo, then platform, then installed dep, then one line, then minimum code. Every deliberate shortcut gets `// ponytail: <limit>. Trigger: <observable event>`; the spec names each one (D9, D23, D29, D30). Never cut: trust-boundary validation, security, accessibility, anything the user asked for.
- **Pre-dispatch verification (plans rot):** before each task, run one read-only grep of every symbol, path and signature it names, and put corrections at the top of the dispatch under "trust these over the plan".
- Every gate on the dashboard uses **effective features**, `getEffectiveFeatures(membership.communityType, resolvePlanId(membership.subscriptionPlan))` (D4). The only exception is the apartment redirect.
- All compliance links point to **`/communities/${communityId}/compliance`**. `/compliance` does not exist.
- `loadDashboardData` / `DashboardData` stay byte-identical (D3; `/mobile` shares them).
- Tenant isolation: reads go through `createScopedClient` or existing services. No new `@propertypro/db/unsafe` import, no new API route.
- Semantic Tailwind classes only. New files pass `pnpm guard:design-tokens` and `pnpm guard:class-resolution` with no baseline growth. Status uses icon + text + colour (`StatusBadge`). There is one filled primary button per region. `AlertBanner` takes `status="danger"`.
- `PageHeader title="Dashboard"` stays the only `<h1>`. No root padding and no `<main>` on the page.
- Builders take `now: Date` and `timeZone: string`; none calls `new Date()` itself.
- Pure builders must not import any module that imports `@propertypro/db`, so tests don't fail at load on a missing `DATABASE_URL`. That means `lib/meetings/meeting-status.ts`, `lib/utils/compliance-calculator.ts`, `lib/utils/compliance-cta.ts` and `lib/utils/zoned-datetime.ts` are fine, and `lib/queries/cross-community.ts` is not.
- Tests: `pnpm test <path>` (never `pnpm test -- <path>`). Component tests begin `// @vitest-environment jsdom`. Each behaviour test's commit names its revert-check: the production line deleted, what went red, what stayed green.
- Review gate before each wave's PR: `/security-review` + `feature-dev:code-reviewer` over `git diff main...HEAD`.

## Review Focus

1. **An Essentials community** (Palm Shores, `hoa_720`) shows no violation tile, no hearing rows and no "Report a problem" or "Ask for a repair" action, because the gates read effective features. Test: Task 3 `essentials community gets no violation or repair actions`; Task 5 `essentials owner sees no violations tile`.
2. **Below the posting threshold, or an HOA:** no deadline rows; the readiness line says "checklist documents", never "required documents"; nothing cites §718. Tests: Task 2 `below-threshold checklist yields no deadline rows`; Task 3 `readiness line never says required`.
3. **Timezone boundary:** a meeting at 23:30 Mon 2 Nov in New York (UTC Tuesday) lands on Monday. Test: Task 3 `buckets by community timezone, not UTC`.
4. **One failed source:** that block shows its danger banner and the rest renders. Tests: Task 1 `one rejected source yields ok:false, others ok:true`; Task 5 `checklist failure keeps queue and agenda`.
5. **A support session:** no write quick actions; read-only blocks still render. Test: Task 3 `support session drops write actions`.

---

## File map and wave ownership

All paths are under `apps/web/src/` unless shown otherwise. Tests go in `apps/web/__tests__/dashboard/` (W1) and `apps/web/__tests__/layout/` (W2).

| Wave | Task | Owns |
|---|---|---|
| W1 | 1 | `lib/services/calendar-data-service.ts` (one column), `lib/dashboard/dashboard-queries.ts` (one query), `lib/dashboard/load-dashboard-overview.ts` (new) |
| W1 | 2 | `lib/dashboard/attention-queue.ts` (new) |
| W1 | 3 | `lib/dashboard/{status-sentence,week-agenda,quick-actions}.ts` (new) |
| W1 | 4 | `components/dashboard/overview/{status-hero,attention-queue-list,week-agenda-list,quick-actions,metric-strip}.tsx` (new) |
| W1 | 5 | `app/(authenticated)/dashboard/page.tsx`, `components/dashboard/dashboard-esign-pending.tsx` (add `id`), `__tests__/app/dashboard/*.test.ts` |
| W1 | 6 | `src/content/help/**/your-dashboard.mdx`, `review-violations.mdx`, `scripts/help-capture/manifests/*/getting-started/your-dashboard.json`, regenerated `public/help/**/dash-*` |
| W1 | 7 | gate + PR |
| W2 | 8 | `components/layout/use-nav-badges.ts` (new, extracted), `components/layout/app-sidebar.tsx` (consume it) |
| W2 | 9 | `components/layout/top-nav-model.ts` (new) |
| W2 | 10 | `components/layout/{top-nav,top-nav-more-menu}.tsx` (new) |
| W2 | 11 | `components/layout/{app-shell,app-top-bar}.tsx`, `components/directory/directory-page-client.tsx:858`, `.env.example`, `turbo.json` |
| W2 | 12 | gate + PR |

---

## Wave 1: the dashboard, inside today's shell

### Task 1: `loadDashboardOverview`

**Files:**
- Modify: `lib/services/calendar-data-service.ts` (add `noticePostedAt` to `CalendarMeetingRecord` and the select), `lib/dashboard/dashboard-queries.ts` (append one query)
- Create: `lib/dashboard/load-dashboard-overview.ts`
- Test: `apps/web/__tests__/dashboard/load-dashboard-overview.test.ts`

**Interfaces:**
- Produces:

```ts
export type Loaded<T> = { ok: true; value: T } | { ok: false };
export interface DashboardHearing { violationId: number; unitLabel: string; hearingDate: string } // ISO
export interface DashboardOverviewData {
  checklist: Loaded<ChecklistItemData[]> | null;      // null = not loaded for this audience/plan (D10, D11)
  meetings30d: Loaded<CalendarMeetingRecord[]>;        // [today 00:00 tz, +30 days)
  hearings: Loaded<DashboardHearing[]> | null;          // null = no board/manager seat or no hasViolations
}
export async function loadDashboardOverview(args: {
  communityId: number; userId: string; membership: CommunityMembership;
  features: CommunityFeatures; timeZone: string; now: Date;
}): Promise<DashboardOverviewData>;

// dashboard-queries.ts
export async function listDashboardUpcomingHearings(
  scoped: ScopedClient, unitIds: number[] | null, now: Date,
): Promise<DashboardHearing[]>;
```

Rules:
- `checklist` loads only when `canActAsBoard(membership)`, `features.hasCompliance`, `checkPermissionV2(…,'compliance','read')`, and `requireEntitledForAdminRead(communityId, membership)` does not throw. It reads `loadChecklistWithStatus(communityId, membership.communityType)`, cast to `ChecklistItemData[]`.
- `meetings30d` comes from `listCommunityCalendarMeetings(communityId, dateOnlyRangeToUtcBounds(today, today + 30, timeZone))`, where `today = dateOnlyInTimeZone(now, timeZone)`. Check the bounds helper's exact signature in the pre-dispatch grep.
- `hearings` loads only when `canActAsBoard(membership)` and `features.hasViolations`. The query filters `status = 'hearing_scheduled'`, `deletedAt` null, and `hearingDate` in `[now, now + 44 days]` (30 + `HEARING_NOTICE_DAYS`). It scopes units through `getViolationReadUnitIds` and labels units the same way `getDashboardViolationSummary` does.
- Each source settles separately (`Promise.allSettled`). A rejection becomes `{ ok: false }` plus `console.error('[dashboard-overview]', source, err)`.
- Adding `noticePostedAt` to the calendar select is additive. Grep its consumers (`app/api/v1/calendar/events/route.ts`, calendar UI). If one spreads the record into a response, confirm the extra field is harmless or omit it there.

- [ ] **Step 1: Write the failing tests:**
  - `one rejected source yields ok:false, others ok:true`
  - `owner gets checklist null and hearings null and loadChecklistWithStatus is not called`
  - `entitlement failure gives checklist null`
  - `essentials (no hasViolations) gives hearings null`
  - `hearing query filters hearing_scheduled` (assert the `where` passed to the mocked scoped client contains the status clause, per api-patterns.md's filter-mock style)
  - extend the calendar service's existing test (grep for it) with `selects noticePostedAt`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/dashboard/load-dashboard-overview.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, the calendar tests and `apps/web/__tests__/dashboard/violation-summary-scope.test.ts` → PASS; `pnpm guard:db-access && pnpm guard:call-ceilings` → PASS.
- [ ] **Step 5: Commit.** `feat(dashboard): fail-soft overview loader (checklist, 30-day meetings, hearings)`

### Task 2: Attention queue builder

**Files:**
- Create: `lib/dashboard/attention-queue.ts`
- Test: `apps/web/__tests__/dashboard/attention-queue.test.ts`

**Interfaces:**
- Consumes: `needsAttention` (`lib/utils/compliance-calculator.ts:138`), `resolveComplianceCta` (`lib/utils/compliance-cta.ts:21`; check its signature in the pre-dispatch grep), `deadlineEscalation`, `noticeWindowLabel`, `formatDeadlineStamp` (`lib/meetings/meeting-status.ts`), `buildMeetingDeadlines` (`lib/meetings/meeting-response.ts:28`), `HEARING_NOTICE_DAYS` (`lib/violations/hearing-notice-warning.ts:25`), `EscalationTier` from the `@propertypro/ui` tokens export.
- Produces:

```ts
export type DashboardAudience = 'manager' | 'board' | 'resident';
export type AttentionKind = 'compliance' | 'meeting_notice' | 'hearing_notice';
export interface AttentionItem {
  id: string;                                  // `${kind}:${sourceId}`
  kind: AttentionKind;
  tier: Exclude<EscalationTier, 'calm'>;
  title: string; detail: string;
  dueAt: string | null;                        // ISO; null only for board-action compliance items
  action: { label: string; href: string };
}
export function buildAttentionQueue(input: {
  audience: Exclude<DashboardAudience, 'resident'>;
  communityId: number; communityType: CommunityType; designation: Designation | null;
  checklist: ChecklistItemData[] | null;
  meetings30d: CalendarMeetingRecord[];
  hearings: DashboardHearing[] | null;
  now: Date; timeZone: string;
}): AttentionItem[];
export function countByTier(items: AttentionItem[]): Record<'critical' | 'urgent' | 'aware', number>;
```

Rules (D5–D10). `{stamp}` means `formatDeadlineStamp(iso, timeZone)`, and `tier(iso)` means `deadlineEscalation(iso, now).label.toLowerCase()`. Add a one-line comment on why the label is reused.

| kind | rows | title | detail | action |
|---|---|---|---|---|
| compliance | `checklist.filter(i => needsAttention(i, now))` | `{item.title}` | overdue: `Was due {stamp}`; deadline: `Due {stamp}`; none: `Needs a board action` | label from `resolveComplianceCta`; href `/communities/{id}/compliance` |
| meeting_notice | `noticePostedAt == null`; `postBy` from `buildMeetingDeadlines`; tier not calm (past → critical) | `Post notice for {title}` | `{noticeWindowLabel} notice · post by {stamp}` | manager "Post notice"; board "View"; href `/meetings/{id}?communityId={id}` |
| hearing_notice | `postBy = hearingDate − HEARING_NOTICE_DAYS days` is after `now` and its tier is not calm | `Send hearing notice — {unitLabel}` | `14-day hearing notice · send by {stamp}` | manager "Open case"; board "View"; href `/violations/{violationId}?communityId={id}` |

Tiers: `status === 'overdue'` → critical. Otherwise `tier(deadline)`. A compliance item with no deadline → aware. Sort: tier rank, then `dueAt` (null last), then `id`. The hearing rule carries the D9 `ponytail:` marker.

- [ ] **Step 1: Write the failing tests:**
  - `orders critical, urgent, aware, then dueAt, nulls last`
  - `compliance rows equal needsAttention` (board-action item with no deadline included as aware)
  - `below-threshold checklist yields no deadline rows` (deadlines null, non-board-action items absent)
  - `links go to /communities/{id}/compliance`
  - `board audience gets View on notice and hearing rows`
  - `board meeting window reads 48 hours, annual reads 14 days` (whatever `noticeWindowLabel` returns, asserted from it)
  - `missed notice window is critical`
  - `noticed meeting is excluded`
  - `hearing whose post-by passed is dropped`
  - `countByTier counts each tier`
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Revert-check: delete the tier-rank comparator → only the ordering test goes red.
- [ ] **Step 5: Commit.** `feat(dashboard): attention queue from compliance, meeting and hearing deadlines`

### Task 3: Status sentence, week agenda, quick actions, metric tiles

**Files:**
- Create: `lib/dashboard/status-sentence.ts`, `lib/dashboard/week-agenda.ts`, `lib/dashboard/quick-actions.ts`
- Test: `apps/web/__tests__/dashboard/{status-sentence,week-agenda,quick-actions}.test.ts`

**Interfaces:**

```ts
// status-sentence.ts
export function resolveDashboardAudience(m: CommunityMembership): DashboardAudience; // isAdmin → manager; canActAsBoard → board; else resident
export interface StatusSentence { tone: 'critical' | 'attention' | 'good'; chipLabel: string; headline: string; body: string }
export function buildStatusSentence(input: {
  audience: DashboardAudience; criticalCount: number; urgentCount: number; pendingSignatures: number;
  readiness: { satisfied: number; applicableTotal: number } | null;
  nextMeeting: { title: string; startsAt: string } | null; timeZone: string;
}): StatusSentence;

// week-agenda.ts
export interface AgendaEntry { id: string; label: string; kind: 'event' | 'deadline'; at: string }
export interface AgendaDay { dateKey: string; weekdayLabel: string; isToday: boolean; entries: AgendaEntry[] }
export function buildWeekAgenda(input: {
  meetings30d: CalendarMeetingRecord[]; attention: AttentionItem[];
  hearings: DashboardHearing[] | null; now: Date; timeZone: string;
}): AgendaDay[]; // exactly 7, today first

// quick-actions.ts
export interface QuickAction { id: string; label: string; href: string; icon: 'megaphone' | 'file' | 'calendar' | 'pen' | 'wrench' | 'alert' | 'user' }
export function buildQuickActions(input: {
  audience: DashboardAudience; communityId: number; features: CommunityFeatures;
  canWriteAnnouncements: boolean; pendingSignatures: number; supportSession: boolean;
}): QuickAction[];
export interface MetricTileData { id: 'violations' | 'maintenance' | 'meetings'; title: string; value: string; subtitle: string; href: string }
export function buildMetricTiles(input: {
  audience: DashboardAudience; features: CommunityFeatures; violationOpenCount: number | null;
  openMaintenanceCount: number; meetings30d: CalendarMeetingRecord[]; communityId: number; timeZone: string;
}): MetricTileData[];
```

Copy and order: spec §4 and §5, exactly. Day keys use `dateOnlyInTimeZone` / `nextDateOnly`. Agenda entries:
- meetings in the 7 days, label `{title}`, kind event
- `meeting_notice` and `hearing_notice` items whose `dueAt` falls in the 7 days, label = item title, kind deadline
- hearing dates, label `Hearing — {unitLabel}`, kind event

`weekdayLabel` is `"Mon 2"` in `timeZone`. Tiles follow D18: violations only with `hasViolations` and a non-null count; maintenance only for manager/board; meetings always. Each `href` uses existing routes (`/violations?communityId=`, `/maintenance?communityId=`, `/meetings?communityId=`). Check in the pre-dispatch grep that the violations list page admits board seats; if it doesn't, the violations tile links to `/violations/report` for non-managers.

- [ ] **Step 1: Write the failing tests:**
  - One per §4 table row, asserting `headline` and `body` exactly, including plural pairs (`O=1` "1 required item is late.", `O=2` "2 required items are late.").
  - `omits readiness when checklist is null`; `readiness line never says required`.
  - `resident with nothing pending` → "You're all caught up." + "No meetings are scheduled."
  - `buckets by community timezone, not UTC` (meeting `2026-11-03T04:30:00Z`, `America/New_York`, now `2026-11-01T12:00:00Z` → day 2, "Mon 2").
  - `always 7 days, today first and only today marked`.
  - Quick actions:
    - `manager, board, resident orders match spec §5`
    - `essentials community gets no violation or repair actions`
    - `support session drops write actions`
    - `never more than 4`
    - `sign label pluralizes and targets #documents-to-sign`
  - Tiles: `tenant gets no maintenance tile`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `feat(dashboard): status sentence, timezone-true week agenda, gated quick actions and tiles`

### Task 4: Overview components

**Files:**
- Create: `components/dashboard/overview/{status-hero,attention-queue-list,week-agenda-list,quick-actions,metric-strip}.tsx`
- Test: `apps/web/__tests__/dashboard/overview-components.test.tsx` (jsdom)

**Interfaces:**
- `StatusHero({ sentence, facts: { label: string; value: string }[] })`: a `section` whose `h2` is the headline (`font-display`); a `StatusBadge` chip with `chipLabel`; facts as a `<dl>` (checklist readiness, next meeting).
- `AttentionQueueList({ items: AttentionItem[] | null; communityId; error: boolean })`:
  - `h3` "Needs attention"; non-zero tier chips via `StatusBadge` (critical "{n} overdue", urgent "{n} due this week", aware "{n} coming up").
  - A `<ul>` of the first 6 rows: tier label + icon, title, detail in `font-mono` for the date, and the action as an outline `Button asChild` link.
  - "View all {n} in Compliance" when more than 6.
  - Empty: `EmptyState preset="action_required_clear"`. Error: `AlertBanner status="danger"` "We couldn't load your to-do list. Please refresh the page."
  - `items === null` renders nothing (residents).
- `WeekAgendaList({ days })`: an `<ol>` of 7, today `aria-current="date"`, empty day "Nothing scheduled".
- `QuickActions({ actions })`: links at least 56px tall, Lucide icons `aria-hidden`.
- `MetricStrip({ tiles })`: the existing `KpiCard` per tile (title, value, subtitle, href), no icon. An empty list renders nothing.

- [ ] **Step 1: Write the failing tests:**
  - `hero headline is an h2`
  - `queue caps at 6 with a View all link to /communities/{id}/compliance`
  - `zero tiers have no chip`
  - `row status has visible text`
  - `empty queue shows the all-set preset`
  - `error shows the danger banner`
  - `null queue renders nothing`
  - `agenda marks today with aria-current=date`
  - `metric strip with no tiles renders nothing`
  - axe on hero + queue + agenda with no violations (copy the setup of an existing `__tests__/accessibility/*-axe.test.tsx`)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** as server components (no `'use client'`); `KpiCard` is already a client component.
- [ ] **Step 4: Run** → PASS; `pnpm guard:design-tokens && pnpm guard:class-resolution` → PASS.
- [ ] **Step 5: Commit.** `feat(dashboard): status hero, needs-attention list, week agenda, quick actions, metric strip`

### Task 5: Compose the page

**Files:**
- Modify: `app/(authenticated)/dashboard/page.tsx`, `components/dashboard/dashboard-esign-pending.tsx` (add `id="documents-to-sign"` to its root `section`), `__tests__/app/dashboard/{website-live-card-gating,apartment-redirect,support-session-narrowing}.test.ts` (mock `loadDashboardOverview`; keep every existing case)
- Test: `apps/web/__tests__/dashboard/dashboard-page-composition.test.tsx`

**Interfaces:**
- `features = getEffectiveFeatures(membership.communityType, resolvePlanId(membership.subscriptionPlan))` drives every gate below the apartment redirect, which keeps `getFeaturesForCommunity(...).hasLeaseTracking`.
- `supportSession = getSupportScope(requestHeaders) !== null`. Confirm the return shape in the pre-dispatch grep.
- `now = new Date()` is taken once. Inside `DashboardPanels`, `loadDashboardData` and `loadDashboardOverview` run in parallel.
- Render order (D13–D20):
  1. `WebsiteLiveCard` (unchanged)
  2. `OnboardingChecklist` (unchanged)
  3. greeting row: date eyebrow, `h2` "Welcome, {firstName}", "Upload document" primary for managers only (`!supportSession`)
  4. `StatusHero`
  5. a `grid gap-6 lg:grid-cols-[2fr_1fr]` row: `AttentionQueueList` (managers and board seats; residents get `null`) | `WeekAgendaList`
  6. `QuickActions`
  7. `MetricStrip`
  8. `DashboardEsignPending` (when effective `hasEsign` and there are pending signers)
  9. `DashboardAnnouncements`
  10. `ComplianceActivityFeed` (when `checkPermissionV2(…,'audit','read')`)
- `DashboardWelcome`, `DashboardMeetings` and `DashboardViolations` are **no longer imported by this page**; their files stay (D19, D20).
- `DashboardSkeleton` matches: hero `h-48`, two columns `h-80`, tiles `h-24`.

- [ ] **Step 1: Write the failing tests** (mock both loaders and render `DashboardPanels`):
  - `manager sees hero, queue, agenda, actions, tiles, activity`
  - `board seat sees queue but no activity feed`
  - `owner sees no queue and no maintenance tile`
  - `greeting heading reads Welcome, {firstName}`
  - `checklist failure keeps queue and agenda` (checklist `ok:false` → hero without readiness, queue with notice rows, the danger banner only on the queue)
  - `essentials owner sees no violations tile`
  - `support session hides the primary Upload button`
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the new test and every existing dashboard and onboarding test (`pnpm test apps/web/__tests__/dashboard apps/web/__tests__/app/dashboard apps/web/__tests__/components/onboarding apps/web/__tests__/components/website-home apps/web/__tests__/mobile/mobile-home.test.ts`) → PASS.
- [ ] **Step 5: Commit.** `feat(dashboard): compose the urgency-first overview; effective-feature gates`

### Task 6: Help copy and screenshots

**Files:** `src/content/help/{manager,resident}/getting-started/your-dashboard.mdx`, `src/content/help/resident/violations/review-violations.mdx`, `scripts/help-capture/manifests/{manager,resident}/getting-started/your-dashboard.json`, regenerated `public/help/**/dash-*.webp`, and `scripts/help-capture/media-index.json` if the capture rewrites it.

- [ ] **Step 1:** Rewrite both `your-dashboard.mdx` around the new sections:
  - status line, Needs attention (managers and board seats), This week, quick actions, the numbers row
  - Documents to Sign (unchanged name), announcements, and for managers the activity feed

  Keep the frontmatter keys and the existing anchors that other articles link to: grep `your-dashboard#` across `src/content/help` first.
- [ ] **Step 2:** In `review-violations.mdx:23`, replace "find the **Violations** card and select **View All**" with the tile wording from Task 3.
- [ ] **Step 3:** In both manifests, replace the "Upcoming Meetings" wait with "This week". Keep the other waits ("Recent Announcements", "Documents to Sign"), but confirm against `dashboard-announcements.tsx` that those headings are unchanged.
- [ ] **Step 4:** Re-capture with the repo's help-capture command (find it in root `package.json` `help:*`) against the agent sandbox. Inspect each new `dash-*` image.
- [ ] **Step 5:** Run `pnpm test` for any help content tests (grep `__tests__` for `content/help`) → PASS. Commit: `docs(help): describe the redesigned dashboard; re-capture dashboard shots`.

### Task 7: Wave 1 gate and PR

- [ ] Run `pnpm typecheck && pnpm lint && pnpm test` → green. Read the summaries, not only the exit codes.
- [ ] Run `pnpm build && pnpm perf:check`. `/(authenticated)/dashboard/page` must stay within its budget and the aggregate under 1435 KiB. Record both numbers; the activity feed is the one new client import.
- [ ] Sandbox: `pnpm agent:live:web`, then log in as `root_sunset`, `board_member`, `tenant`, `owner` (Palm Shores, Essentials), and `cam` under a support session if one can be opened locally. Screenshot at 1440 and 390 px. Walk Review Focus 1–5.
- [ ] e2e, locally: `support-access`, `community-tenant-host-precedence`, `onboarding-first-run` → PASS.
- [ ] `/security-review` + `feature-dev:code-reviewer`; resolve each finding.
- [ ] Open the PR "Dashboard: urgency-first overview (W1 of 2)". Include the spec link, screenshots, perf numbers, revert-checks, and spec §7 (not built) and §6 (found, not ours) verbatim.

---

## Wave 2: top tabs behind `NEXT_PUBLIC_TOP_NAV_ENABLED` (default off)

Branch from `main` after W1 merges.

### Task 8: Extract the rail's badge reads into `useNavBadges`

**Files:** Create `components/layout/use-nav-badges.ts`; modify `components/layout/app-sidebar.tsx` to call it. Tests: the existing `apps/web/__tests__/layout/app-sidebar-badge.test.tsx` (unchanged), plus `apps/web/__tests__/layout/use-nav-badges.test.tsx` (jsdom).

**Interfaces:** `export function useNavBadges(args: { communityId: number | null; isAdmin: boolean; features: CommunityFeatures }): { pendingJoinRequests: number; missingRecords: number }`. The body is the badge logic moved out of `AppSidebar` (around `app-sidebar.tsx:164`); query keys, enablement and error handling stay identical.

- [ ] Write `useNavBadges` tests for non-admin zeros and admin counts → FAIL. Move the code → the new tests and **all** `__tests__/layout/app-sidebar-*.test.tsx` PASS, unchanged. Commit: `refactor(shell): share the rail's badge reads`.

### Task 9: `buildTopNavModel`

**Files:** Create `components/layout/top-nav-model.ts`; test `apps/web/__tests__/layout/top-nav-model.test.ts`.

**Interfaces:**

```ts
export interface TopNavLink { id: string; label: string; href: string; active: boolean; badge: number | null; planLocked: boolean }
export interface TopNavModel { tabs: TopNavLink[]; moreGroups: { label: string; links: TopNavLink[] }[]; moreHasActive: boolean; moreHasBadge: boolean }
export function buildTopNavModel(input: {
  pathname: string; communityId: number | null; role: CommunityRole; isUnitOwner: boolean;
  features: CommunityFeatures; communityType: CommunityType; planId: PlanId | null; lapsedAdmin: boolean;
  badges: { pendingJoinRequests: number; missingRecords: number };
}): TopNavModel;
```

Rules: D24 (visible `default` tier → tabs in `NAV_ITEMS` order; visible `more` tier and children → More, grouped by `NAV_SECTIONS` label, empty groups dropped), D25 (`planLocked` kept and flagged), D26 (badges, `moreHasBadge`), D27 (active via `getActiveItemId`; PM paths → `PM_NAV_ITEMS` as tabs with no groups; lapsed → dashboard only; `communityId === null` → empty model). Visibility comes from `getVisibleItemsWithPlanGate`. If the pre-dispatch grep shows `buildSlimNavSections` already performs the tier split on that output, call it rather than re-splitting.

- [ ] **Tests:**
  - `professional manager gets Dashboard, Documents, Meetings, Announcements, Website, Compliance, Directory as tabs`
  - `tenant tabs have no admin items`
  - `every visible item is reachable` (tabs ∪ groups = visible set incl. children)
  - `plan-locked items stay, flagged`
  - `PM path gives PM tabs only`
  - `lapsed admin gets dashboard only`
  - `no community gives an empty model`
  - `badge inside More sets moreHasBadge`
  - `active child inside More sets moreHasActive`
- [ ] FAIL → implement → PASS. Commit: `feat(shell): top-nav model from nav-config tiers`.

### Task 10: `TopNav` and `TopNavMoreMenu`

**Files:** Create `components/layout/top-nav.tsx`, `components/layout/top-nav-more-menu.tsx`; test `apps/web/__tests__/layout/top-nav.test.tsx` (jsdom).

**Interfaces:** `TopNav({ model, communityId })` (`'use client'`).
- Renders `<nav aria-label="Main navigation">` with `next/link` tabs: `aria-current="page"`, a `border-b-2 border-interactive` underline when active, `border-transparent` otherwise.
- A `planLocked` link renders as a button that opens the existing `UpgradeDialog` with the same props `AppSidebar` passes, and shows `PlanBadge variant="pro"`.
- `TopNavMoreMenu({ groups, hasActive, hasBadge, communityId })`:
  - Trigger: `<button aria-expanded aria-haspopup="true">More</button>` + chevron + optional dot with sr-only "has updates".
  - Panel: Radix `Popover` with a 2-column grid of group label (`font-mono text-xs`) and links, plus a footer "Can't find it? Search every page and record." with a `⌘K` kbd.
  - Choosing a link closes the panel; Escape closes it and returns focus.

- [ ] **Tests:**
  - `active tab has aria-current=page`
  - `More opens on click and closes on Escape with focus restored`
  - `More is absent with no groups`
  - `locked item opens UpgradeDialog`
  - `badge dot has an accessible label`
  - axe with More open → no violations
- [ ] FAIL → implement → PASS; run the design guards. Commit: `feat(shell): TopNav tabs and grouped More menu`.

### Task 11: Wire the flag

**Files:** `components/layout/app-shell.tsx`, `components/layout/app-top-bar.tsx`, `components/directory/directory-page-client.tsx:858`, `.env.example`, `turbo.json`. Test: `apps/web/__tests__/layout/app-shell-top-nav-flag.test.tsx` (jsdom).

**Interfaces:**
- `export const TOP_NAV_ENABLED = process.env.NEXT_PUBLIC_TOP_NAV_ENABLED === 'true'` beside `HELP_DOCS_MODAL_ENABLED`. `ShellInner` takes `topNav?: boolean` (default `TOP_NAV_ENABLED`) so tests can toggle it. The shell carries the D23 `ponytail:` marker.
- **Flag on:**
  - The `hidden lg:block` desktop `AppSidebar` wrapper (`app-shell.tsx:180`) is skipped.
  - `<div className="hidden lg:block border-b border-edge bg-surface-card"><TopNav …/></div>` renders directly under `AppTopBar`. Its model gets the same inputs `AppSidebar` gets, and `badges` comes from `useNavBadges`.
  - `AppTopBar` gets `brand?: ReactNode`, rendered first at `lg` and up. The shell passes the brand tile (copy whatever markup the rail header shows; find it in `sidebar-tenant-switcher.tsx`), the community name, and `PlanBadge` (D29). No switcher dropdown; ProfileMenu's "Switch Community" stays the path.
- **Flag off:** no `brand`, no tab row, identical markup.
- **Below `lg`, either way:** drawer unchanged.
- **Directory (D30):** `TOP_NAV_ENABLED ? 'h-[calc(100dvh-19rem)]' : 'h-[calc(100dvh-16rem)]'`, both full literals, with the D30 `ponytail:` marker.
- `.env.example` gets `NEXT_PUBLIC_TOP_NAV_ENABLED=false` with a one-line comment citing D23. In `turbo.json`, declare the flag wherever `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` is declared. If that one is undeclared too, add both to the `build` task's `env` so the cache key tracks them.

- [ ] **Tests:**
  - `flag off: desktop sidebar present, no TopNav, no brand slot`
  - `flag on: TopNav present, desktop sidebar absent`
  - `flag on: mobile drawer trigger still present`
  - `flag on: top bar shows community name and plan badge`
  - `directory split view uses the taller offset only when flag on` (render `directory-page-client` under each value, or assert the class string)
  - Then run every existing `__tests__/layout/` test → PASS, unchanged.
- [ ] FAIL → implement → PASS. Commit: `feat(shell): NEXT_PUBLIC_TOP_NAV_ENABLED renders top tabs instead of the desktop rail (default off)`.

### Task 12: Wave 2 gate and PR

- [ ] With the flag **off**: run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm perf:check` → numbers match W1 within noise. Run e2e `demo-flows`, `responsive-overflow` and `wave-2-ga-staging` → PASS (rail untouched).
- [ ] With the flag **on** in the sandbox (`secrets.env` + delete `apps/web/.next`, per the sandbox notes):
  - Log in as `root_sunset`, `tenant`, `pm_admin` (PM paths), `founding_admin` (Essentials, locked items) and a 2-community `owner` (switching via the profile menu).
  - Screenshot at 1440, 1024 (tabs) and 1023 (drawer).
  - Open Directory's units split view: no double scroll.
- [ ] `/security-review` + `feature-dev:code-reviewer`.
- [ ] Open the PR "Shell: top tabs behind a flag (W2 of 2)". State that the flag is off everywhere, and paste spec §6's flip-plan checklist into the body so it is not lost.

---

## Self-review

- **Coverage:**
  - Problems 1–5 → Tasks 1–5 (5 via D4 in Task 5).
  - D3 → Task 1 (new loader only). D5–D10 → Task 2. D11 → Task 1. D12 → Task 3.
  - D13–D15, D19–D22 → Task 5. D16 → Tasks 1 and 3. D17, D18 → Task 3.
  - D23, D29, D30 → Task 11. D24, D25, D27 → Task 9. D26 → Tasks 8 and 9. D28 → Task 10.
  - §6 W1 collateral → Tasks 5 and 6. §6 flip items → carried into the W2 PR body.
- **Types:**
  - `Loaded<T>` and `DashboardHearing` come from Task 1; `CalendarMeetingRecord` with `noticePostedAt` from Task 1.
  - `DashboardAudience` and `AttentionItem` come from Task 2 and are used in Tasks 3–5.
  - `TopNavModel` comes from Task 9 and is used in Tasks 10–11.
- **Ponytail cuts versus revision 1:**
  - Recent-activity loader, describe map and table → reuse `ComplianceActivityFeed`.
  - Compact onboarding variant → keep the checklist.
  - Signature queue row and the `/esign` link that dead-ends for residents → keep the card, add an anchor.
  - Website URL extraction → cut.
  - Escalation module move → reuse `deadlineEscalation`.
  - New meetings query → one column on the calendar query.
  - Invented tab groups → `navTier` + `NAV_SECTIONS`.
  - Hiding locked items → parity.
  - Header switcher → ProfileMenu.
  - Net: 12 tasks instead of 14, with fewer new modules.

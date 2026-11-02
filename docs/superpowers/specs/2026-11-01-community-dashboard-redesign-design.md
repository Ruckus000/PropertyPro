# Community Dashboard Redesign — Design

**Status:** approved direction, 2026-11-01; **revision 2** (same day), re-cut with the ponytail
method after a whole-app impact sweep. Mockups: claude.ai Design canvas
`https://claude.ai/artifact/6PqQuEdYw33f95QNb5nVKh`, artboards **"D · A + C blend"** and **"D · Tab
overflow"** (skin: Florida Modern). Rounds A–C on the canvas are rejected alternatives. The mockup
is the target look; where this spec differs from it, the spec wins, and §7 lists every deviation.

**User decisions (2026-11-01):** blend A + C; Vercel-style layout; **top tabs** instead of the
side rail; **Florida Modern** skin. Everything else here is a design decision open to review.

## 1. Problem

Measured on 2026-11-01 against `apps/web/src/app/(authenticated)/dashboard/page.tsx`:

1. **Compliance is absent** from the dashboard, the product's core promise.
2. **`openMaintenanceCount` is loaded and never shown** (only `/mobile` renders it).
3. **A welcome card with no information** ("Here are your latest announcements…") sits above
   the content, under up to two other intro blocks.
4. **Nothing is sorted by urgency.** It is an even 2-column card grid.
5. **Feature gates ignore the plan.** The page gates on type-only `getFeaturesForCommunity`. So
   an Essentials community (no violations, no e-sign) can be shown violation cards whose links
   end at an upgrade screen. The shell already uses
   `getEffectiveFeatures(type, resolvePlanId(plan))`.

## 2. Method (ponytail)

Every requirement went down the ladder **after** the impact sweep, and the first rung that fully
works wins:

1. Does it need to exist?
2. Is it already in this codebase?
3. Is it a platform feature?
4. Is it in an installed dependency?
5. Can it be one readable line?
6. Otherwise, write the minimum code.

Never cut: validation at trust boundaries, security, accessibility, anything the user asked for.
Each deliberate shortcut carries the repo's marker, `// ponytail: <limit>. Trigger: <observable
event>` (`.claude/rules/verification.md`).

## 3. Decision ledger (normative)

An implementer who disagrees with an entry files a finding and does not stop to ask.

### Wave 1: dashboard content, inside today's shell

| # | Decision | Rung / why |
|---|---|---|
| D1 | **Two waves, two PRs.** W1 = dashboard content in today's shell. W2 = top tabs behind a build-time flag, **default off**. Flipping the flag is a third, separate plan (§6). | The tab row touches every page; the dashboard must not wait on it. |
| D2 | Condo/HOA only. The apartment redirect stays. `/mobile`, PM overview and admin are untouched. | Scope. |
| D3 | **`loadDashboardData` / `DashboardData` are not modified.** New reads go in `loadDashboardOverview`. | `/mobile` shares that loader. |
| D4 | **Every dashboard gate uses effective features**: `getEffectiveFeatures(membership.communityType, resolvePlanId(membership.subscriptionPlan))`. This replaces the page's type-only `getFeaturesForCommunity`, except for the apartment redirect, which stays type-based. | Rung 2: the shell's own call (`page-shell-context.ts:81`). It fixes problem 5 and costs no query. |
| D5 | **Attention queue** = one list merging three kinds: `compliance`, `meeting_notice`, `hearing_notice`. Tiers: **critical**, **urgent**, **aware**; calm items are dropped. Order: critical, urgent, aware, then `dueAt` ascending (null last), then `id`. Show the first **6**, then "View all in Compliance" linking to **`/communities/{id}/compliance`**. | The compliance page is not at `/compliance`; that path 404s. |
| D6 | Deadline tiers come from the existing `deadlineEscalation(iso, now)` (`lib/meetings/meeting-status.ts:179`), with its label lower-cased into `EscalationTier` from `@propertypro/ui` tokens. No new classifier, and the private `classifyComplianceEscalation` is not moved. | Rung 2. Three copies already exist; this adds none. |
| D7 | **Compliance rows = exactly the items `needsAttention(item, now)` returns** (`compliance-calculator.ts:138`), which includes the board-action items that have no deadline. Tier: `overdue` is critical; otherwise from the deadline; with no deadline, aware. Action labels come from `resolveComplianceCta` (`lib/utils/compliance-cta.ts:21`), which already varies by role and designation. | Rung 2. The dashboard and the compliance page's banner then never disagree. |
| D8 | **Meeting-notice rows:** meetings in the next 30 days with `noticePostedAt` null. `postBy` comes from the existing `buildMeetingDeadlines`. Window wording comes from `noticeWindowLabel` (`meeting-status.ts:165`). A `postBy` in the past is critical. | Rung 2. |
| D9 | **Hearing-notice rows:** violations with `status = 'hearing_scheduled'` whose `hearingDate − HEARING_NOTICE_DAYS` (existing constant) is in the future and within 30 days. | The schema has no "notice sent" fact. Marker: `ponytail: past windows drop because sent-vs-missed is unknowable. Trigger: a hearing-notice-sent column lands.` |
| D10 | **Who sees what:** manager (`isAdmin`) gets all three kinds. A board seat (`canActAsBoard && !isAdmin`) gets all three, with labels from `resolveComplianceCta` and "View" on notice and hearing rows. Owners and tenants get **no queue**; they get no compliance read, and signatures stay on their existing card (D13). Hearings additionally need effective `hasViolations`. Compliance needs effective `hasCompliance`, `compliance` read and `requireEntitledForAdminRead`. | ADR-006: a designation grants no writes. |
| D11 | **The checklist loads only for managers and board seats.** Owners and tenants cost **zero** extra queries. | It cost 3 uncached queries per load. |
| D12 | **Status sentence** is a pure function, with exact copy in §4. The readiness line says "checklist documents", not "required documents". | Below the posting threshold nothing is legally required, and the compliance page says "recommended". |
| D13 | **Signatures:** the existing `DashboardEsignPending` card stays, for every audience, with `id="documents-to-sign"`. It is the only in-app list of a resident's pending signatures, because `/esign` redirects non-admins. The status sentence and quick action count them. The quick action links to `#documents-to-sign`. | Rung 2. It also keeps `sign-document.mdx` true. |
| D14 | **Announcements:** the existing `DashboardAnnouncements` stays, for every audience. | Rung 2. Two emails' "Read in the portal" links land on `/dashboard`, and two help articles say announcements "appear on your dashboard". |
| D15 | **Recent activity (managers):** the existing `ComplianceActivityFeed` (`components/compliance/compliance-activity-feed.tsx`), mounted when `checkPermissionV2(…,'audit','read')`. No new loader. | Rung 2. It already redacts metadata via `/api/v1/audit-trail` and sits inside `AppQueryProvider`. |
| D16 | **This week:** 7 days from today, keyed by the community timezone with `dateOnlyInTimeZone` / `nextDateOnly` / `dateOnlyRangeToUtcBounds` (`lib/utils/zoned-datetime.ts`). Meetings come from `listCommunityCalendarMeetings` with **one column added** (`noticePostedAt`), read once for 30 days and shared with D8. Entries are meetings, notice post-by dates and hearing dates. | Rung 2 + rung 5. No new meetings query. |
| D17 | **Quick actions:** at most 4, role- and feature-gated, verb-first (§5). **Hidden for write actions under a support session** (`getSupportScope(headers)` is non-null), because support sessions are read-only. | Never cut: callers that stop working. |
| D18 | **Metric strip:** open violations (effective `hasViolations`; community-wide for board seats and managers, own units otherwise, as today), open maintenance (managers and board seats only, since it is a community-wide count), upcoming meetings (30 days). Rendered with the existing `KpiCard`, with no icon, because an icon is a component and cannot cross into this client component. A tile the user may not see is omitted. | Rung 2. |
| D19 | **Intro blocks:** the condo page stops rendering `DashboardWelcome`. The greeting moves into the page's greeting row as `h2` "Welcome, {firstName}" (`support-access.spec.ts` pins it). The **file stays**, because the apartment dashboard and `guard:page-header`'s list use it. `OnboardingChecklist` and `WebsiteLiveCard` are **unchanged**. | Rung 1 cut: a compact strip would hide the checklist's per-item actions, its "Continue" target `/welcome` redirects back to `/dashboard`, and `onboarding-first-run.spec.ts` pins the full list. The checklist is temporary anyway. |
| D20 | The condo page stops rendering `DashboardMeetings` (replaced by This week and the next-meeting line) and `DashboardViolations` (replaced by the violations tile). Both files stay; `dashboard-sections.test.tsx` and the page-test mocks still name them. | Deletion where it is safe. |
| D21 | **Fail-soft per source:** the overview loader returns `Loaded<T> = { ok: true; value: T } \| { ok: false }`. A failed source renders that block's `AlertBanner status="danger"` ("We couldn't load … Please refresh the page."); everything else renders. | Never cut: one broken read must not blank the landing page. |
| D22 | Every new block is a server component, inside the existing `DashboardPanels` Suspense boundary. | Keeps `perf:check` flat; the activity feed is the only client addition. |

### Wave 2: top tabs behind `NEXT_PUBLIC_TOP_NAV_ENABLED`

> **Flipped on 2026-11-02 (the flip PR after #1438).** The tabs are now the default: the
> inline checks read `!== 'false'`, `next.config.ts` maps an unset variable to `"true"`, and
> only the exact value `false` brings the rail back (a kill switch, still dead-code-eliminated).
> Removing the flag and the rail branch is the `ponytail:` marker in `top-nav-flag.ts`.

| # | Decision | Rung / why |
|---|---|---|
| D23 | **Flag:** `NEXT_PUBLIC_TOP_NAV_ENABLED === 'true'`, the same build-time pattern as `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED`. Off: today's markup, byte for byte. On, at `lg` and up: the desktop `AppSidebar` wrapper is not rendered, and a tab row renders under `AppTopBar`. Below `lg`: the hamburger + `AppSidebar` drawer, **unchanged**. | The rail component is **never deleted**: the phone drawer and `EditorFrame` keep using it. Marker: `ponytail: two desktop navs while the flag exists. Trigger: the flag is on in production; the flip PR removes the off branch and the flag.` |
| D24 | **What becomes a tab vs More:** reuse nav-config's existing `navTier`. Visible `default`-tier items are tabs, in `NAV_ITEMS` order. Visible `more`-tier items go into **More**, grouped under their existing `NAV_SECTIONS` labels (Community / Management / Admin). Children (move-in-out, violations-inbox) appear as their own links in More. No new id lists. | Rung 2. A manager on Professional gets 7 tabs: Dashboard, Documents, Meetings, Announcements, Website, Compliance, Directory. Moving an item is a one-line `navTier` edit, which also moves it in Essentials' slim sidebar. |
| D25 | **Plan-locked items keep today's behaviour:** they show (in More), with the existing `PlanBadge variant="pro"`, and clicking one opens the existing `UpgradeDialog`. | **Corrects revision 1**, which hid them and wrongly logged that as a user decision. Parity is rung 2, and it keeps upgrade discovery. |
| D26 | **Badges** reuse the rail's sources (`useAdminJoinRequests`, `useRecordsAlert`). The badge-reading code is extracted from `AppSidebar` into one hook that both navs call; that is a dedup, not a new abstraction. A badge on an item inside More shows as a dot on the More button, with sr-only text. | Rung 2, without a near-copy. |
| D27 | **Active item:** existing `getActiveItemId`. **PM paths:** existing `isPmPortfolioPath` → `PM_NAV_ITEMS` as tabs, with no More. **Lapsed admin:** Dashboard tab only. **No community** (e.g. `/select-community`): no tab row, because that page is the picker. | Parity with `AppSidebar`. |
| D28 | **Landmark:** `<nav aria-label="Main navigation">` of links with `aria-current="page"`, inside a `hidden lg:block` wrapper, so the open drawer never makes a second visible landmark. More is a disclosure button (`aria-expanded`) over the existing Radix `Popover`; Escape closes it and returns focus. | e2e specs and help-capture locate "Main navigation". These are links, not ARIA tabs. |
| D29 | **Top bar, flag on:** brand tile + community name + `PlanBadge`, left of search. **Switching communities uses the existing ProfileMenu "Switch Community" item**; no new header dropdown. | Rung 2. Marker: `ponytail: switching takes two clicks via the profile menu. Trigger: multi-community users ask for one-click switching.` |
| D30 | **Directory split view** (`directory-page-client.tsx:858`, `h-[calc(100dvh-16rem)]`) is the only viewport-sized pane in the shell. Flag on, use `h-[calc(100dvh-19rem)]`, both written as full literal classes in a ternary. Every other sticky or fixed element is relative to `<main>` or the viewport and needs nothing. | Measured sweep. Marker on the ternary: trigger = flag removed. |

## 4. Status sentence copy (exact)

`audience`: `manager` (isAdmin), `board` (canActAsBoard, not admin), or `resident`.
**O** = critical rows, **U** = urgent rows (queue, D5).
**P/T** = `readiness.satisfied` / `readiness.applicableTotal` from `buildComplianceSummary`.
**S** = pending signers.
Plural pairs: "item is"/"items are", "thing is"/"things are", "document is"/"documents are".

| audience | condition | tone | headline | body |
|---|---|---|---|---|
| manager, board | O > 0 | `critical` | `{O} required {item is/items are} late.` | `{U} more {is/are} due this week. ` (only when U > 0) + readiness line |
| manager, board | O = 0, U > 0 | `attention` | `Almost up to date. {U} {thing is/things are} due this week.` | readiness line |
| manager, board | O = 0, U = 0 | `good` | `You're up to date.` | `Nothing is late or due this week. ` + readiness line |
| resident | S > 0 | `attention` | `{S} {document is/documents are} waiting for your signature.` | next-meeting line |
| resident | S = 0 | `good` | `You're all caught up.` | next-meeting line |

- Readiness line: `{P} of {T} checklist documents are posted.` Omitted when the checklist is
  not loaded (D10/D11) or failed (D21).
- Next-meeting line: `The next meeting is {title} on {formatDeadlineStamp(startsAt, tz)}.`, or
  `No meetings are scheduled.`
- Tone chips, rendered with `StatusBadge` (icon + text + colour): critical "Late items",
  attention "Needs attention", good "Up to date".

## 5. Quick actions

`?cid` = `?communityId={id}`. Each action shows only when its gate passes.

| audience | actions, in order |
|---|---|
| manager | New announcement `/announcements/new?cid` (`announcements` write) · Upload document `/documents?cid` · Schedule meeting `/meetings?cid` (`hasMeetings`) · Sign {S} document(s) `#documents-to-sign` (S > 0) |
| board | Find a document `/documents?cid` · Report a problem `/violations/report?cid` (`hasViolations`) · Sign {S} document(s) `#documents-to-sign` (S > 0) · Update my contact info `/settings/account?cid` |
| resident | Ask for a repair `/maintenance/submit?cid` (`hasMaintenanceRequests`) · Find a document · Report a problem (`hasViolations`) · Update my contact info |

All feature gates use effective features (D4). Under a support session, drop New announcement,
Upload document, Schedule meeting, Ask for a repair and Report a problem (D17).

## 6. Collateral

**Wave 1 (in its PR):**
- `src/content/help/{manager,resident}/getting-started/your-dashboard.mdx`: rewrite. They describe "Upcoming Meetings", the Violations card and the welcome card.
- `src/content/help/resident/violations/review-violations.mdx:23`: "Violations card … View All" becomes the violations tile.
- `scripts/help-capture/manifests/{manager,resident}/getting-started/your-dashboard.json`: replace the "Upcoming Meetings" wait with "This week", then re-capture `dash-*`.
- The three page tests `__tests__/app/dashboard/{website-live-card-gating,apartment-redirect,support-session-narrowing}.test.ts`: mock `loadDashboardOverview` (it would otherwise hit the DB). `dashboard-sections.test.tsx` stays as it is.

**Wave 2 (in its PR):** none user-visible while the flag is off.

**Flip plan (later, its own PR):**
- About 33 help MDX files that say "sidebar"/"in the sidebar"/"under Admin". The heavy ones are `getting-started/getting-around.mdx` ×2 and `join-community.mdx:56`.
- Re-capture `gs-nav-{m,r}` (manifests clip to "Main navigation").
- `e2e/demo-flows.spec.ts:231-252` (rail scroll) and `e2e/wave-2-ga-staging.spec.ts:59-70`.
- A flag-on run of `e2e/responsive-overflow.spec.ts`.
- Remove the flag and the off branch, and keep the `xl:` width workarounds' comments true.

**Found, not ours (separate follow-ups):**
- `lib/services/notification-service.ts:569` links `/compliance?…`, which 404s.
- `lib/services/snowbird-digest-processor.ts:225` links `/communities/{id}/dashboard`, which 404s.
- `e2e/wave-2-ga-staging.spec.ts:137` is stale.
- The comment at `select-community/page.tsx:1` is stale.

## 7. Not building (ponytail rung-1 cuts, and deviations from the mockup)

- **Compact setup strip.** The full checklist stays; it is temporary and carries the actions (D19).
- **Owner-website fact in the hero.** The Website tab reaches the site; it would have meant refactoring `loadWebsiteLiveCard`.
- **A signature row in the queue.** The existing card stays (D13).
- **A new recent-activity loader or table.** We reuse the compliance feed; its look differs from the mockup's table (D15).
- **A § citation footer in the hero.** The HOA statute differs (§720.303), and the compliance page already cites it.
- **Invented tab groups.** The mockup put Operations and Violations on tabs and Directory in More; existing tiers decide instead (D24).
- **A header community-switcher dropdown** (D29).
- **Hiding plan-locked items** (D25).
- **A per-user maintenance count** (D18).
- **Moving or duplicating the escalation classifier** (D6).

# Test Report: PropertyPro Full Application Test

Date: 2026-04-04
Tester: Codex (Playwright browser audit)

## Environment

- Dev server: `http://127.0.0.1:3002` (current worktree, started via `next dev`)
- Seed data: Present in connected environment; explicit `pnpm seed:demo` attempt from this worktree stalled without output, but `/dev/agent-login` confirmed seeded demo users and communities exist
- Roles tested: Pending
- Roles skipped: Pending
- Evidence directory: Playwright screenshots captured during execution (filenames recorded inline where relevant)

## Live Execution Log

### Setup

- Status: Complete
- Notes:
  - Loaded project guidance from `CLAUDE.md`, `AGENTS.md`, and the audit checklist in `docs/testing/cursor-full-app-test-prompt.md`.
  - Created `.env.local` symlink for this worktree to the existing local PropertyPro environment without inspecting secret values.
  - Installed workspace dependencies and built the package layer so the worktree server could boot correctly.
  - Started a dedicated worktree server on `127.0.0.1:3002` to avoid reusing another checkout's dev session.
  - Verified demo access by calling `/dev/agent-login?as=board_president` and receiving non-empty `allCommunities` plus a valid portal response.

### Phase 1 Progress

- Logged in as `board_president` and confirmed access to both `Palm Shores HOA` and `Sunset Condos`; redirected testing context to `Sunset Condos` with `communityId=1` per audit plan.
- Dashboard loaded successfully with `Sunset Condos`, `Welcome, Sam`, announcement empty state, seeded meetings, seeded violations, and a seeded e-sign card.
- Onboarding checklist rendered with the expected six setup tasks and dismissed successfully via the close button.
- Sidebar rendered all expected manager-level sections and items for the condo context. Collapse and expand both worked.

## Phase Results

### Phase 1: Board President (Admin Sweep)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Dashboard | PASS | Loaded on `Sunset Condos` with correct greeting, onboarding checklist, seeded meetings, seeded violations, and pending e-sign card. |
| 1.2 | Sidebar Navigation | PASS | All expected sections/items rendered; collapse to compact mode and expand back both worked; user footer showed `Sam President / Manager`. |
| 1.3 | Documents | PASS | Heading/subtitle and action buttons rendered; seeded documents loaded; selecting a document populated preview; upload panel opened and closed successfully. |
| 1.4 | Meetings | PASS | Calendar page rendered with seeded meetings/assessments and a working `Create Meeting` form containing title, meeting type, start, end, and location fields. |
| 1.5 | Announcements | FAIL | `/announcements?communityId=1` only showed an empty state and `Go to Dashboard`; no `New Announcement` or create action was available for a manager role. |
| 1.6 | Board Section | FAIL | Polls and Forum routes rendered, but no Elections tab was visible; direct navigation to `/communities/1/board/elections` returned a 500 error page. |
| 1.7 | Operations | FAIL | `/communities/1/operations?tab=requests` returned the generic error shell instead of the maintenance/operations UI. |
| 1.8 | Packages | FAIL | `/dashboard/packages?communityId=1` returned the generic error shell instead of a package log or intake form. |
| 1.9 | Visitors | FAIL | `/dashboard/visitors?communityId=1` returned the generic error shell instead of visitor-management content. |
| 1.10 | Payments | FAIL | Payments nav expands correctly with `Assessments` and `Finance`, but `/communities/1/payments` shows `We couldn't load your payment data`; `Assessments` and `Finance` routes themselves rendered. |
| 1.11 | Report Violation | PASS | Violation form rendered with category, description, severity, and photo fields plus seeded violation history. |
| 1.12 | Compliance | PASS | Compliance dashboard rendered score, filters, category progress, pending items, and action controls such as `Export`, `Link Existing`, and `Upload`. |
| 1.13 | Residents | PASS | Resident list, search box, and add/import actions rendered with seeded residents; no row-detail panel appeared when clicking a resident card. |
| 1.14 | Contracts | FAIL | `/contracts?communityId=1` returned the generic error shell. |
| 1.15 | E-Sign | FAIL | `/esign?communityId=1` returned a 500 error page before the templates/submissions UI could load. |
| 1.16 | Audit Trail | FAIL | `/audit-trail?communityId=1` returned the generic error shell instead of activity log content. |
| 1.17 | Notifications | PENDING | Not tested yet |
| 1.18 | Search | PENDING | Not tested yet |
| 1.19 | Settings | PENDING | Not tested yet |
| 1.20 | Emergency Broadcasts | PENDING | Not tested yet |
| 1.21 | Direct URL Navigation | PENDING | Not tested yet |

### Phase 2: Owner (Mobile)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Mobile Home | PENDING | Not tested yet |
| 2.2 | Mobile Documents | PENDING | Not tested yet |
| 2.3 | Mobile Announcements | PENDING | Not tested yet |
| 2.4 | Mobile Meetings | PENDING | Not tested yet |
| 2.5 | Mobile Maintenance | PENDING | Not tested yet |
| 2.6 | Mobile Payments | PENDING | Not tested yet |
| 2.7 | Mobile Notifications | PENDING | Not tested yet |
| 2.8 | Mobile Search | PENDING | Not tested yet |
| 2.9 | Mobile Settings & More | PENDING | Not tested yet |
| 2.10 | Mobile Help | PENDING | Not tested yet |
| 2.11 | Desktop Access Test | PENDING | Not tested yet |

### Phase 3: PM Admin

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | Multi-Community Access | PENDING | Not tested yet |
| 3.2 | PM Dashboard | PENDING | Not tested yet |
| 3.3 | PM Community Drill-Down | PENDING | Not tested yet |
| 3.4 | PM Reports | PENDING | Not tested yet |
| 3.5 | PM Branding | PENDING | Not tested yet |
| 3.6 | Apartment Dashboard | PENDING | Not tested yet |

### Phase 4: Additional Roles

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | CAM | PENDING | Not tested yet |
| 4.2 | Board Member | PENDING | Not tested yet |
| 4.3 | Tenant | PENDING | Not tested yet |
| 4.4 | Site Manager | PENDING | Not tested yet |

### Phase 5: Public Pages

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Landing Page | PENDING | Not tested yet |
| 5.2 | Login Page | PENDING | Not tested yet |
| 5.3 | Forgot Password | PENDING | Not tested yet |
| 5.4 | Signup Page | PENDING | Not tested yet |
| 5.5 | Legal Pages | PENDING | Not tested yet |
| 5.6 | Transparency Page | PENDING | Not tested yet |

### Phase 6: Cross-Cutting Concerns

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | Responsive Layout | PENDING | Not tested yet |
| 6.2 | Sidebar Collapse/Expand | PENDING | Not tested yet |
| 6.3 | Expandable Nav Items | PENDING | Not tested yet |
| 6.4 | Error States | PENDING | Not tested yet |
| 6.5 | Session Persistence | PENDING | Not tested yet |
| 6.6 | Community Switching | PENDING | Not tested yet |

## Bugs Found

1. **[P1] Announcements page has no create path for board president** — URL: `/announcements?communityId=1` — Expected: manager-level announcement page should expose `New Announcement` or similar compose action — Actual: page rendered only an empty state plus `Go to Dashboard`.
2. **[P1] Board elections route crashes with server error** — URL: `/communities/1/board/elections` — Expected: elections list, empty state, or gated message — Actual: HTTP 500 with `Something went wrong`.
3. **[P1] Operations page crashes for condo manager** — URL: `/communities/1/operations?tab=requests` — Expected: operations or maintenance request management UI — Actual: generic error shell.
4. **[P1] Packages page crashes for condo manager** — URL: `/dashboard/packages?communityId=1` — Expected: package log and `Log Package` workflow — Actual: generic error shell.
5. **[P1] Visitors page crashes for condo manager** — URL: `/dashboard/visitors?communityId=1` — Expected: visitor-management page — Actual: generic error shell.
6. **[P1] Payments landing page cannot load payment data** — URL: `/communities/1/payments` — Expected: payment dashboard — Actual: inline danger alert reading `We couldn't load your payment data.`.
7. **[P1] Contracts page crashes for condo manager** — URL: `/contracts?communityId=1` — Expected: contracts list or empty state — Actual: generic error shell.
8. **[P1] E-Sign landing page returns 500** — URL: `/esign?communityId=1` — Expected: templates/submissions surface — Actual: 500 error page.
9. **[P1] Audit Trail page crashes for condo manager** — URL: `/audit-trail?communityId=1` — Expected: searchable activity log — Actual: generic error shell.
10. **[P0] Authenticated routes exhaust database connections during audit** — Evidence: Next dev server logs and browser console show `PostgresError: Max client connections reached` in `requireCommunityMembership`, `listCommunitiesForUser`, and `/dev/agent-login`; once triggered, authenticated routes and re-login flows begin returning 500s.

## Warnings / Observations

1. The residents page rendered seeded residents and actions, but clicking a resident card did not reveal any detail panel or drill-down UI.
2. The board forum and polls routes render independently, but the board landing experience is split across direct URLs rather than a single tabbed surface that exposes all three areas from one place.

## Features Not Testable

None logged yet.

## Seed Data Issues

None logged yet.

## Console / Network Evidence

- Browser console captured 500 responses for `/communities/1/board/elections`, `/communities/1/operations?tab=requests`, `/dashboard/packages?communityId=1`, `/dashboard/visitors?communityId=1`, and later `/dashboard?communityId=1`.
- Worktree server logs traced the failing authenticated pages to database exhaustion: `PostgresError: Max client connections reached` while resolving community membership and community lists in `src/lib/api/community-membership.ts`, `src/lib/request/page-shell-context.ts`, `src/app/(authenticated)/layout.tsx`, and `/dev/agent-login`.

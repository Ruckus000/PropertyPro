# PropertyPro — End-to-End Visual Test Guide

> **For:** Cursor Browser Tool
> **App:** PropertyPro Florida — Compliance & community management for Florida condo/HOA associations
> **Stack:** Next.js 15 / React 19 / Tailwind / shadcn/ui / Supabase
> **Dev server:** `http://localhost:3000`

---

## How to Use This Guide

You are performing a **visual end-to-end audit** of the PropertyPro web application. Your job is to navigate the app as different user roles, observe what renders, interact with key features, and produce a structured audit report at the end.

### Rules

1. **Do NOT explore the codebase.** Everything you need is in this document.
2. **Do NOT guess URLs.** Use only the exact URLs provided below.
3. **Take a screenshot after each navigation** to document what you see.
4. **Log every issue** you find using the rubric categories at the bottom.
5. **Complete each role's test flow in order** before moving to the next role.
6. **If a page errors or crashes**, screenshot it, log the issue, and move on.
7. **Do NOT attempt to fix anything.** Observe and report only.

### How to Authenticate

The dev server exposes a magic login endpoint. To switch roles, navigate to:

```
http://localhost:3000/dev/agent-login?as=<ROLE>
```

This sets session cookies and redirects you to the appropriate portal. No passwords needed.

After navigating to the agent-login URL, wait for the redirect to complete, then take a screenshot to confirm you're logged in.

---

## Part 0: Pre-Flight

Before testing, confirm the dev server is running and responsive.

| Step | Action | Expected |
|------|--------|----------|
| 0.1 | Navigate to `http://localhost:3000` | Page loads (either public landing or redirect to login) |
| 0.2 | Navigate to `http://localhost:3000/dev/agent-login?as=owner&communityId=1` | Redirects to `/mobile?communityId=...` with a loaded page |
| 0.3 | Take a screenshot | You see a mobile-style home screen with "Sunset Condos" header |

If any of these fail, stop and report. The dev server is not ready.

---

## Part 1: Owner Role (Resident Portal)

**Login:** `http://localhost:3000/dev/agent-login?as=owner&communityId=1`
**User:** Olivia Owner (`owner.one@sunset.local`)
**Community:** Sunset Condos (Miami, FL — condo_718)
**Expected portal:** Mobile-first layout (`/mobile?communityId=...`)

### 1A — Mobile Home Screen

| Step | Action | What to Verify |
|------|--------|----------------|
| 1A.1 | Observe the home screen after login | Community name "Sunset Condos" is visible in header. Location shows Miami, FL. Profile button (initials avatar) is in top-right corner. |
| 1A.2 | Check navigation rows | You should see rows for: **Documents**, **Announcements**, **Meetings**, **Maintenance**. Each has an icon, title, and description. |
| 1A.3 | Check for a summary card | There should be a summary or feature card showing recent announcements count, upcoming meetings, or similar stats. |

### 1B — Mobile Documents

| Step | Action | What to Verify |
|------|--------|----------------|
| 1B.1 | Tap the **Documents** row | Navigates to `/mobile/documents?communityId=...`. Page loads with a document list. |
| 1B.2 | Observe document list | Documents are visible. Categories may include: Declaration, Rules & Regulations, Meeting Minutes, Announcements, Inspection Reports. |
| 1B.3 | Tap on a document | A document viewer or detail view opens. The document title and category are displayed. |
| 1B.4 | Navigate back | Back button or browser back returns to the documents list. |

### 1C — Mobile Announcements

| Step | Action | What to Verify |
|------|--------|----------------|
| 1C.1 | Navigate to `/mobile/announcements?communityId=...` (or go Home and tap Announcements) | Page loads with an announcement feed. |
| 1C.2 | Observe announcements | You should see at least: **"Sunset Condos Pool Maintenance Notice"** (pinned) and **"Sunset Condos Lobby Refresh"**. |
| 1C.3 | Check pinned indicator | The Pool Maintenance Notice should have a visual pinned indicator (pin icon or "Pinned" label). |

### 1D — Mobile Meetings

| Step | Action | What to Verify |
|------|--------|----------------|
| 1D.1 | Navigate to `/mobile/meetings?communityId=...` | Calendar or meeting list loads. |
| 1D.2 | Observe meetings | You should see upcoming meetings. Look for owner meetings and board meetings. |
| 1D.3 | Tap a meeting | Detail modal or view opens with meeting title, date, time, and location. |

### 1E — Mobile Maintenance

| Step | Action | What to Verify |
|------|--------|----------------|
| 1E.1 | Navigate to `/mobile/maintenance?communityId=...` | Maintenance page loads. |
| 1E.2 | Look for a "Submit Request" button or form | Owner should be able to submit maintenance requests. |
| 1E.3 | If empty state shows | Verify it says something like "All clear!" or "No open maintenance requests." with constructive messaging. |

### 1F — Mobile Settings & More

| Step | Action | What to Verify |
|------|--------|----------------|
| 1F.1 | Navigate to `/mobile/more?communityId=...` | "More" menu loads with navigation options. |
| 1F.2 | Navigate to `/mobile/settings?communityId=...` | Settings page loads with account options. |
| 1F.3 | Navigate to `/mobile/help?communityId=...` | Help page loads with support info. |

### 1G — Payments (Owner View)

| Step | Action | What to Verify |
|------|--------|----------------|
| 1G.1 | Navigate to `/payments?communityId=...` | Payment portal loads. |
| 1G.2 | Observe payment info | Should show assessment info. Look for "Monthly Maintenance Assessment" ($350.00) and/or "Special Assessment — Roof Repair" ($1,500.00). |

---

## Part 2: Board President Role (Admin Portal)

**Login:** `http://localhost:3000/dev/agent-login?as=board_president&communityId=1`
**User:** Sam President (`board.president@sunset.local`)
**Community:** Sunset Condos
**Expected portal:** Desktop dashboard (`/dashboard?communityId=...`)

### 2A — Dashboard

| Step | Action | What to Verify |
|------|--------|----------------|
| 2A.1 | Observe dashboard after login | Welcome message shows "Welcome back, Sam" (or first name). Community name "Sunset Condos" is visible. |
| 2A.2 | Check sidebar navigation | **Main group** should show: Dashboard, Documents, Meetings, Announcements, Maintenance, Leases, Packages, Visitors, Payments, Report Violation. **Admin group** (labeled "ADMIN") should show: Compliance, Residents, Inbox, Contracts, E-Sign, Violations Inbox, Move In/Out, Audit Trail, Assessments, Finance. |
| 2A.3 | Check dashboard widgets | Should see sections for: Announcements (recent), Meetings (upcoming), Violations (summary), E-Sign Pending (if any). Layout is 2-column grid on desktop. |
| 2A.4 | Verify announcements widget | Should show "Sunset Condos Pool Maintenance Notice" and/or "Sunset Condos Lobby Refresh". |
| 2A.5 | Verify meetings widget | Should show upcoming meetings. |

### 2B — Compliance Dashboard

| Step | Action | What to Verify |
|------|--------|----------------|
| 2B.1 | Click **Compliance** in the Admin sidebar section | Navigates to `/communities/{id}/compliance`. Page loads. |
| 2B.2 | Observe compliance score ring | A circular score ring shows the overall compliance percentage. A tier badge is visible (calm/aware/urgent/critical). |
| 2B.3 | Check filter pills | Filter options should include status filters (all, satisfied, overdue, etc.) and category filters. |
| 2B.4 | Observe checklist items | Items grouped by category. Look for these groups: **Governing Documents**, **Financial Records**, **Meeting Records**, **Insurance**, **Operations**. |
| 2B.5 | Check for compliance gaps | **Insurance** — "Current Insurance Policies" should show as **unsatisfied/overdue** (intentionally missing in seed data). All other governing docs should be satisfied. |
| 2B.6 | Check meeting compliance indicators | Meeting notices should show compliance status. The 21-day notice and 52-hour notice meetings should be compliant. The 10-day notice and 36-hour notice meetings may show as non-compliant. |
| 2B.7 | Look for action buttons on items | Each item should have action buttons (link document, upload document, etc.). |
| 2B.8 | Check for deadline ribbon | Items approaching deadlines should show a colored ribbon (blue=calm, yellow=aware, orange=urgent, red=critical). |

### 2C — Documents Library

| Step | Action | What to Verify |
|------|--------|----------------|
| 2C.1 | Click **Documents** in sidebar | Navigates to documents page. |
| 2C.2 | Observe document list | Documents are listed with titles, categories, dates. As admin, you should see an upload action (button or drag-drop area). |
| 2C.3 | Check category filter | Category filter should be present with options like Declaration, Rules & Regulations, Meeting Minutes, etc. |
| 2C.4 | Try search | If a search bar exists, click it and type a term. Results should filter. |

### 2D — Meetings & Calendar

| Step | Action | What to Verify |
|------|--------|----------------|
| 2D.1 | Click **Meetings** in sidebar | Calendar page loads with month grid. |
| 2D.2 | Check month navigation | Previous/Next month buttons work. Current month is shown. |
| 2D.3 | Click a date with a meeting dot | Day detail panel shows the meeting for that date. |
| 2D.4 | Click on a meeting | Meeting detail modal opens with title, date, time, type (annual/board), and notice info. |
| 2D.5 | Look for "Create Meeting" or similar | Admin should have ability to create meetings (button or form). |

### 2E — Violations Inbox

| Step | Action | What to Verify |
|------|--------|----------------|
| 2E.1 | Click **Violations Inbox** in Admin sidebar | Violations inbox loads. |
| 2E.2 | Observe violation list | Should see violations in various states. Expected seeded violations: **Noise** (reported), **Unauthorized modification** (noticed), **Parking** (hearing_scheduled), **Pet** (fined). Total: 4 violations. |
| 2E.3 | Check status badges | Each violation should have a status badge with color coding (not just color — must include icon + text). |
| 2E.4 | Click on a violation | Detail view opens showing: category, unit, status, severity, dates, description. |
| 2E.5 | Check for status transition actions | Admin should see buttons to advance the violation through its workflow (e.g., "Send Notice", "Schedule Hearing", "Issue Fine"). |

### 2F — Residents

| Step | Action | What to Verify |
|------|--------|----------------|
| 2F.1 | Click **Residents** in Admin sidebar | Residents list loads. |
| 2F.2 | Observe resident list | Should show community members with names, roles, units, emails. |
| 2F.3 | Check for add/invite actions | Should see button to add or invite residents. |

### 2G — E-Sign

| Step | Action | What to Verify |
|------|--------|----------------|
| 2G.1 | Click **E-Sign** in Admin sidebar | E-Sign hub loads. |
| 2G.2 | Navigate to Templates | Should see 2 templates: **"Proxy Designation Form"** and **"Violation Acknowledgment"**. |
| 2G.3 | Navigate to Submissions | Should see at least 1 submission in **pending** status (the Proxy Designation demo submission with 2 pending signers). |

For a **full send-to-sign** pass through the real staff and public UIs, continue in **Part 3C** (CAM, `communityId=1`).

### 2H — Finance

| Step | Action | What to Verify |
|------|--------|----------------|
| 2H.1 | Click **Finance** in Admin sidebar | Finance dashboard loads. |
| 2H.2 | Check KPI row | Key financial metrics displayed in cards at top. |
| 2H.3 | Check tabs | Should see tabs for: **Assessments**, **Delinquency**, **Ledger**, **Recent Payments**. |
| 2H.4 | Click Assessments tab | Should show "Monthly Maintenance Assessment" ($350/unit, monthly) and "Special Assessment — Roof Repair" ($1,500/unit, one-time). |

### 2I — Assessments

| Step | Action | What to Verify |
|------|--------|----------------|
| 2I.1 | Click **Assessments** in Admin sidebar | Assessment roll loads. |
| 2I.2 | Observe line items | Per-unit assessment line items. Some should be **overdue** (last month's maintenance) and some **pending** (this month's). |

### 2J — Audit Trail

| Step | Action | What to Verify |
|------|--------|----------------|
| 2J.1 | Click **Audit Trail** in Admin sidebar | Audit log viewer loads. |
| 2J.2 | Observe log entries | Should show a chronological list of compliance/system events with timestamps, actors, and descriptions. |
| 2J.3 | Check for filters | Search or filter controls should be present. |

### 2K — Announcements

| Step | Action | What to Verify |
|------|--------|----------------|
| 2K.1 | Click **Announcements** in sidebar | Announcement feed/list loads. |
| 2K.2 | Observe announcements | "Sunset Condos Pool Maintenance Notice" (pinned) and "Sunset Condos Lobby Refresh" should be visible. |
| 2K.3 | Look for create button | Admin should see an "Create Announcement" button or composer. |

### 2L — Emergency

| Step | Action | What to Verify |
|------|--------|----------------|
| 2L.1 | Navigate to `/emergency?communityId=...` | Emergency broadcast page loads. |
| 2L.2 | Observe broadcast history | Should see **"Hurricane Preparation Advisory"** from ~5 days ago. Status: all delivered (3/3). |
| 2L.3 | Look for "New Broadcast" button | Admin should be able to create new emergency broadcasts. |

### 2M — Contracts

| Step | Action | What to Verify |
|------|--------|----------------|
| 2M.1 | Click **Contracts** in Admin sidebar | Contracts page loads. |
| 2M.2 | Observe list or empty state | May show empty state: "Community is in good standing" or similar if no contracts are seeded. |

### 2N — Settings

| Step | Action | What to Verify |
|------|--------|----------------|
| 2N.1 | Navigate to `/settings?communityId=...` | Settings hub loads. |
| 2N.2 | Navigate to `/settings/account` | Account settings page with profile info. |
| 2N.3 | Navigate to `/settings/transparency` | Transparency settings page (toggle public portal features). |

---

## Part 3: CAM Role (Community Association Manager)

**Login:** `http://localhost:3000/dev/agent-login?as=cam`
**User:** Cameron CAM (`cam.one@sunset.local`)
**Community:** Sunset Condos (also has access to Palm Shores HOA)

### 3A — Dashboard & Multi-Community

| Step | Action | What to Verify |
|------|--------|----------------|
| 3A.1 | After login, observe dashboard | Should see Sunset Condos dashboard. Sidebar and admin items should be visible (CAM is an admin role). |
| 3A.2 | Navigate to `/select-community` | Community picker loads showing **Sunset Condos** and **Palm Shores HOA**. |
| 3A.3 | Select **Palm Shores HOA** | Dashboard reloads for Palm Shores HOA (Fort Lauderdale, FL — hoa_720). |
| 3A.4 | Check compliance for Palm Shores | Navigate to Compliance. HOA checklist items should appear (720_* items). **Contracts** should be missing (intentional gap). |

### 3B — Quick Smoke Test (Palm Shores HOA)

| Step | Action | What to Verify |
|------|--------|----------------|
| 3B.1 | Documents page loads | Documents library shows Palm Shores HOA documents. |
| 3B.2 | Meetings page loads | Calendar with Palm Shores meetings. |
| 3B.3 | Violations inbox | Should show 2 violations for Palm Shores. |
| 3B.4 | Switch back to Sunset Condos via `/select-community` | Verify you can switch communities cleanly. |

### 3C — E-Sign: send and sign (full browser flow)

Use this flow when you need to **see** the real staff UI and public signer UI react to input—not only the hub snapshot in **2G**. Pin **Sunset Condos** so seeded e-sign templates exist (`communityId=1`).

**Session A — staff (CAM)**

| Step | Action | What to Verify |
|------|--------|----------------|
| 3C.1 | Navigate to `http://localhost:3000/dev/agent-login?as=cam&communityId=1` | Redirect completes; dashboard loads for Sunset Condos. **Screenshot** after redirect. |
| 3C.2 | Go to `http://localhost:3000/esign?communityId=1` (or click **E-Sign** in the Admin sidebar, then confirm URL has `communityId=1`) | **E-Sign** hub: heading "E-Sign", **Send Document** button visible. **Screenshot.** |
| 3C.3 | Click **Send Document** | **Send Document for Signing** page: step "1. Select Template", template field shows **Choose a template...**. **Screenshot.** |
| 3C.4 | Open the template control, use **Search templates...**, type `Violation`, select **Violation Acknowledgment** | Step 2 **Configure Signers** appears with role/name/email fields. **Screenshot.** |
| 3C.5 | Enter signer **Full name** `Tenant One` and **Email address** `tenant.one@sunset.local` | Fields accept input; **Review & Send** enables when valid. |
| 3C.6 | Click **Review & Send**, then **Send for Signing** on the confirm card | Request submits; you return to `/esign?communityId=1` (or stay in flow briefly). **Screenshot** of hub with an additional pending submission if visible. |
| 3C.7 | Click the **newest** pending row (or open the submission you just created from the list) | Submission detail loads. **Screenshot.** |
| 3C.8 | In **Signers**, find **Copy signing link** and **Open signing page** for the pending signer | Controls are visible for pending/opened signers. **Screenshot.** (Automated tests may read the create response instead; this is the user-visible path.) |

**Session B — public signer (same browser or new tab)**

| Step | Action | What to Verify |
|------|--------|----------------|
| 3C.9 | Click **Open signing page** (opens `/sign/...` in a new tab) or paste the copied URL in the address bar | Public signing page: **Signing as:** and signer email visible. **Screenshot.** |
| 3C.10 | Complete required PDF fields (placeholders depend on template), open **Owner Signature**, choose **Type**, type full name, **Confirm**, accept consent, **Finish** | Heading **Signing complete** (or equivalent success state). **Screenshot.** |

If **Violation Acknowledgment** does not appear in the template list, stop: run `pnpm seed:demo` (with `.env.local` loaded) and retry.

---

## Part 4: PM Admin Role (Property Manager Portal)

**Login:** `http://localhost:3000/dev/agent-login?as=pm_admin&communityId=1`
**User:** Pat PM (`pm.admin@sunset.local`)
**Community:** Sunset Condos (also manages Palm Shores HOA)

### 4A — PM Dashboard

| Step | Action | What to Verify |
|------|--------|----------------|
| 4A.1 | After login, observe dashboard | May land on standard dashboard or PM portal. |
| 4A.2 | Navigate to `/pm/dashboard/communities` | PM portfolio page loads with managed communities. |
| 4A.3 | Observe portfolio table | Should list communities this PM manages. Look for **Sunset Condos** and **Palm Shores HOA**. Each row shows name, type, compliance score, and status. |
| 4A.4 | Check KPI row | Portfolio-wide metrics should display (total communities, average compliance, etc.). |

### 4B — PM Branding

| Step | Action | What to Verify |
|------|--------|----------------|
| 4B.1 | Navigate to `/pm/settings/branding` | Branding page loads with customization options. |
| 4B.2 | Observe form | Logo upload, color settings, or brand customization fields should be present. |

### 4C — PM Reports

| Step | Action | What to Verify |
|------|--------|----------------|
| 4C.1 | Navigate to `/pm/reports` | Reports page loads. |
| 4C.2 | Observe report options | Should see report generation options or analytics. |

---

## Part 5: Site Manager Role (Apartment Community)

**Login:** `http://localhost:3000/dev/agent-login?as=site_manager&communityId=3`
**User:** Sierra Site (`site.manager@sunsetridge.local`)
**Community:** Sunset Ridge Apartments (Tampa, FL — apartment type)

### 5A — Apartment Dashboard

| Step | Action | What to Verify |
|------|--------|----------------|
| 5A.1 | After login, observe dashboard | Should see Sunset Ridge Apartments. Apartment dashboard may have different layout than condo dashboard. |
| 5A.2 | Check sidebar | Admin nav should be visible. Compliance-related items may be **hidden** or **plan-locked** since apartments don't require §718/§720 compliance. |
| 5A.3 | Check for apartment-specific features | Look for: Leases, Packages, Visitors, Move In/Out — these are apartment-oriented features. |

### 5B — Residents (Apartment)

| Step | Action | What to Verify |
|------|--------|----------------|
| 5B.1 | Navigate to Residents | Should show tenant list. Sunset Ridge has 17+ tenants across units 101-303. |
| 5B.2 | Verify tenant data | Look for tenant names and unit numbers. Units range from 101-106, 201-206, 301-303. |

### 5C — Leases

| Step | Action | What to Verify |
|------|--------|----------------|
| 5C.1 | Navigate to Leases | Lease management page loads. |
| 5C.2 | Observe lease list | Should show active leases for apartment units. |

---

## Part 6: Tenant Role (Limited Access)

**Login:** `http://localhost:3000/dev/agent-login?as=tenant&communityId=1`
**User:** Tyler Tenant (`tenant.one@sunset.local`)
**Community:** Sunset Condos

### 6A — Tenant Mobile Portal

| Step | Action | What to Verify |
|------|--------|----------------|
| 6A.1 | After login, observe portal | Should land on mobile portal (tenants are non-admin). |
| 6A.2 | Check available navigation | Tenant should see: Documents, Announcements, Meetings, Maintenance. Should NOT see admin items (Compliance, Residents, Finance, etc.). |
| 6A.3 | Navigate to Documents | Document list loads. Tenant sees community documents but cannot upload. |
| 6A.4 | Navigate to Maintenance | Should be able to submit maintenance requests. |
| 6A.5 | Navigate to Announcements | Should see same announcements as owner. |

---

## Part 7: Cross-Cutting Tests

Perform these with **any logged-in admin role** (board_president recommended).

### 7A — Navigation & Layout

| Step | Action | What to Verify |
|------|--------|----------------|
| 7A.1 | Click every main sidebar item | Each page loads without error. No blank screens or uncaught exceptions. |
| 7A.2 | Click every admin sidebar item | Each page loads. Some may show empty states — that's OK. Log any errors. |
| 7A.3 | Collapse the sidebar | Sidebar collapses to icon-only rail. Labels disappear but icons remain. |
| 7A.4 | Expand sidebar | Sidebar expands back with full labels. |
| 7A.5 | Check breadcrumbs / page headers | Each page has a clear header with title. |

### 7B — Empty States

| Step | Action | What to Verify |
|------|--------|----------------|
| 7B.1 | Find a page with no data (Contracts, or maintenance if empty) | Empty state shows a **title**, **description**, and **action button**. Should NOT just say "No data found". |
| 7B.2 | Verify empty state messaging | Titles should be encouraging and action-oriented (e.g., "Let's get you compliant", "Schedule your first meeting", "All clear!"). |

### 7C — Responsive Layout

| Step | Action | What to Verify |
|------|--------|----------------|
| 7C.1 | Resize browser to mobile width (~375px) | Layout adapts. Sidebar may collapse or become a hamburger menu. Content is not cut off or overlapping. |
| 7C.2 | Resize to tablet width (~768px) | Layout adapts gracefully. Grid may go from 2-column to 1-column. |
| 7C.3 | Resize back to desktop (~1280px) | Layout returns to full desktop view with 2-column grids. |

### 7D — Loading & Error States

| Step | Action | What to Verify |
|------|--------|----------------|
| 7D.1 | Observe page transitions | Pages should show loading skeletons (animated placeholder shapes) while data loads, NOT just blank space. |
| 7D.2 | If any API error occurs | An error banner should appear with message like "Something went wrong" + a "Retry" button. Should NOT show raw error traces. |

### 7E — Status Indicators

| Step | Action | What to Verify |
|------|--------|----------------|
| 7E.1 | On the Violations page, check status badges | Each badge uses **icon + text + color** (never color alone). Statuses: reported, noticed, hearing_scheduled, fined. |
| 7E.2 | On the Compliance page, check item statuses | Items show clear status (satisfied, unsatisfied, overdue, not applicable) with appropriate color and icon. |
| 7E.3 | On the Assessments page, check line item statuses | Overdue items show danger styling. Pending items show neutral/warning styling. |

### 7F — Accessibility Basics

| Step | Action | What to Verify |
|------|--------|----------------|
| 7F.1 | Tab through the sidebar | Focus ring (outline) is visible on each item. Focus is never invisible. |
| 7F.2 | Tab through a form (if available) | Inputs receive visible focus. Tab order is logical (top to bottom, left to right). |
| 7F.3 | Check text sizes | Body text should be at least 16px. No primary content should use text smaller than 11px. |

---

## Part 8: Public Transparency Pages

These pages are **unauthenticated**. Log out first or use an incognito context.

| Step | Action | What to Verify |
|------|--------|----------------|
| 8.1 | Navigate to `http://localhost:3000/dev/site-preview` | Public site preview page loads (dev helper to access subdomain pages on localhost). |
| 8.2 | If preview links to Sunset Condos public page | Public home page shows community info. |
| 8.3 | Check for transparency/compliance info | Should display document checklist, meeting notices, and compliance status — all read-only, no login required. |
| 8.4 | Check for request-access form | Public visitors may see a way to request resident access. |

> **Note:** Subdomain routing (`sunset-condos.getpropertypro.com`) won't work on localhost. Use the dev site preview helper or navigate to `/(public)/sunset-condos/` paths if the app supports them locally.

---

## Audit Rubric

After completing all test flows, fill in this rubric. For each category, assign a score of **Pass**, **Partial**, or **Fail**, and list specific issues found.

### Scoring Key
- **Pass** — Feature works as expected, no issues found
- **Partial** — Feature mostly works but has minor issues (cosmetic bugs, slight data mismatches, non-blocking UX issues)
- **Fail** — Feature is broken, crashes, shows wrong data, or is completely inaccessible

---

### Category 1: Authentication & Role Switching

| Check | Score | Notes |
|-------|-------|-------|
| Agent-login works for all 6 roles (owner, tenant, board_president, cam, pm_admin, site_manager) | | |
| Each role redirects to correct portal (mobile vs desktop) | | |
| Session persists across page navigations | | |
| Community picker works for multi-community users (cam, pm_admin) | | |

### Category 2: Navigation & Layout

| Check | Score | Notes |
|-------|-------|-------|
| All sidebar items load without error | | |
| Sidebar collapse/expand works | | |
| Role-based nav items are correctly shown/hidden | | |
| Admin section is labeled and visually separated | | |
| Plan-locked features show lock icon (if applicable) | | |
| Page headers are present and accurate | | |
| Mobile navigation rows work | | |

### Category 3: Dashboard & Widgets

| Check | Score | Notes |
|-------|-------|-------|
| Welcome message shows correct user name | | |
| Announcements widget shows seeded data | | |
| Meetings widget shows upcoming meetings | | |
| Violations widget shows violation summary | | |
| E-Sign pending widget shows (if pending items exist) | | |
| 2-column grid layout on desktop | | |
| Apartment dashboard loads for site_manager | | |

### Category 4: Compliance Features

| Check | Score | Notes |
|-------|-------|-------|
| Compliance score ring displays with percentage | | |
| Tier badge visible (calm/aware/urgent/critical) | | |
| Checklist grouped by category (5 groups) | | |
| Insurance item shows as unsatisfied/overdue (intentional gap) | | |
| Filter pills work (status + category) | | |
| Deadline ribbons show with color coding | | |
| Action buttons present on each item (link doc, upload) | | |
| Activity feed / audit log loads | | |
| HOA compliance (Palm Shores) shows 720_* items | | |
| Contracts gap visible in Palm Shores HOA | | |

### Category 5: Documents

| Check | Score | Notes |
|-------|-------|-------|
| Document list loads with seeded data | | |
| Category filter works | | |
| Search functionality works | | |
| Document viewer opens on click | | |
| Admin sees upload capability | | |
| Non-admin (owner/tenant) cannot upload | | |

### Category 6: Meetings & Calendar

| Check | Score | Notes |
|-------|-------|-------|
| Month grid calendar renders | | |
| Month navigation (prev/next) works | | |
| Date click shows day detail | | |
| Meeting detail modal opens | | |
| Meeting info is complete (title, date, time, type) | | |
| Admin can create meetings | | |

### Category 7: Violations

| Check | Score | Notes |
|-------|-------|-------|
| Violations inbox shows 4 violations (Sunset Condos) | | |
| All 4 states represented: reported, noticed, hearing_scheduled, fined | | |
| Status badges use icon + text + color (not color alone) | | |
| Violation detail view loads with full info | | |
| Status transition actions available for admin | | |
| Categories displayed: noise, unauthorized_modification, parking, pet | | |

### Category 8: E-Sign

| Check | Score | Notes |
|-------|-------|-------|
| E-Sign hub loads | | |
| 2 templates visible: Proxy Designation Form, Violation Acknowledgment | | |
| 1 pending submission visible | | |
| Submission detail shows 2 pending signers | | |
| (Optional deep pass) Part **3C**: Send Document form → Violation Acknowledgment → signers → confirm send | | |
| (Optional deep pass) Submission detail shows **Copy signing link** / **Open signing page** for pending signer | | |
| (Optional deep pass) Public `/sign/...` page completes with success state | | |

### Category 9: Finance & Assessments

| Check | Score | Notes |
|-------|-------|-------|
| Finance dashboard loads with KPI row | | |
| 4 tabs present: Assessments, Delinquency, Ledger, Recent Payments | | |
| Monthly Maintenance Assessment: $350/unit, monthly | | |
| Special Assessment — Roof Repair: $1,500/unit, one-time | | |
| Overdue line items show danger styling | | |
| Pending line items show appropriate styling | | |

### Category 10: Announcements

| Check | Score | Notes |
|-------|-------|-------|
| Announcement feed loads | | |
| "Pool Maintenance Notice" visible and pinned | | |
| "Lobby Refresh" visible | | |
| Admin sees create button | | |
| Non-admin sees read-only view | | |

### Category 11: Emergency Broadcasts

| Check | Score | Notes |
|-------|-------|-------|
| Emergency page loads | | |
| "Hurricane Preparation Advisory" visible | | |
| Delivery status shows 3/3 delivered | | |
| Admin can create new broadcast | | |

### Category 12: Residents Management

| Check | Score | Notes |
|-------|-------|-------|
| Resident list loads with names, roles, units | | |
| Add/invite resident button present for admin | | |
| Apartment community shows 17+ tenants | | |

### Category 13: PM Portal

| Check | Score | Notes |
|-------|-------|-------|
| PM communities page loads | | |
| Portfolio table shows managed communities | | |
| KPI row displays portfolio metrics | | |
| Branding page loads | | |
| Reports page loads | | |

### Category 14: Mobile Experience

| Check | Score | Notes |
|-------|-------|-------|
| Mobile home screen renders correctly | | |
| Navigation rows are tappable and navigate correctly | | |
| All mobile subpages load (documents, announcements, meetings, maintenance, settings, help) | | |
| Touch targets are adequately sized (not too small) | | |
| Content is readable without horizontal scrolling | | |

### Category 15: Responsive Design

| Check | Score | Notes |
|-------|-------|-------|
| Desktop layout: 2-column grids, full sidebar | | |
| Tablet layout: graceful adaptation | | |
| Mobile layout: single column, collapsed nav | | |
| No content overflow or horizontal scroll at any width | | |
| Text remains readable at all sizes | | |

### Category 16: Data Accuracy

| Check | Score | Notes |
|-------|-------|-------|
| Correct user names shown for each role | | |
| Correct community names displayed | | |
| Violation counts match expected (4 for Sunset, 2 for Palm Shores) | | |
| Assessment amounts match ($350 maintenance, $1,500 roof repair) | | |
| Announcement titles match seeded data | | |
| E-Sign template names match | | |

### Category 17: Error Handling & States

| Check | Score | Notes |
|-------|-------|-------|
| Loading skeletons shown during data fetches | | |
| Empty states have encouraging titles + action buttons | | |
| Error states show user-friendly messages (not raw errors) | | |
| No unhandled console errors visible in UI | | |

### Category 18: Accessibility Basics

| Check | Score | Notes |
|-------|-------|-------|
| Focus rings visible on keyboard navigation | | |
| Tab order is logical | | |
| Body text is at least 16px | | |
| Status indicators use icon + text (not just color) | | |
| Buttons have descriptive labels (verb-first) | | |

---

### Summary

| Category | Score | Critical Issues |
|----------|-------|-----------------|
| 1. Authentication & Role Switching | | |
| 2. Navigation & Layout | | |
| 3. Dashboard & Widgets | | |
| 4. Compliance Features | | |
| 5. Documents | | |
| 6. Meetings & Calendar | | |
| 7. Violations | | |
| 8. E-Sign | | |
| 9. Finance & Assessments | | |
| 10. Announcements | | |
| 11. Emergency Broadcasts | | |
| 12. Residents Management | | |
| 13. PM Portal | | |
| 14. Mobile Experience | | |
| 15. Responsive Design | | |
| 16. Data Accuracy | | |
| 17. Error Handling & States | | |
| 18. Accessibility Basics | | |

**Overall Assessment:** (Pass / Partial / Fail)

**Top 5 Critical Issues:**
1.
2.
3.
4.
5.

**Top 5 Non-Critical Issues:**
1.
2.
3.
4.
5.

**Recommendations:**
-
-
-

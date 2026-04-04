# PropertyPro Full Application Test — Cursor Browser Prompt

You are performing a comprehensive end-to-end manual test of the PropertyPro web application using your browser tools. Your job is to systematically visit every feature, verify it renders correctly, test key interactions, and report any bugs, broken UI, or errors you find.

---

## SETUP & ENVIRONMENT

### Prerequisites

**1. Seed demo data** (required — the app is empty without this):
```bash
./scripts/with-env-local.sh pnpm seed:demo
```
This creates 3 demo communities (Sunset Condos, Palm Shores HOA, Sunset Ridge Apartments) with demo users and sample data (documents, meetings, violations, e-sign templates, compliance checklists).

**2. Start the dev server:**
```bash
pnpm dev
```
Wait for compilation to complete. The web app runs on `http://localhost:3000`.

### Authentication

Use the agent-login endpoint to authenticate as different demo users. **Do NOT read .env.local or try to extract credentials.**

**Two-step login process** (more reliable than direct navigation):

```javascript
// Step 1: Authenticate and get session info
fetch('/dev/agent-login?as=<role>', { headers: { 'Accept': 'application/json' } })
  .then(r => r.json())
  .then(d => console.log(JSON.stringify(d, null, 2)))

// Step 2: Navigate to the portal URL from the response
window.location.href = d.portal  // e.g. "/dashboard?communityId=1"
```

The JSON response tells you:
- `ok: true` — authentication succeeded
- `community` — the user's primary community (null = no community membership = DATA PROBLEM)
- `allCommunities` — all communities the user belongs to
- `portal` — where to navigate next (includes `?communityId=X`)

**If `allCommunities` is empty for a role**, the seed data is incomplete. Log it and skip to a role that works.

### Available Demo Roles

| Role | `?as=` value | Name | Community | Type |
|------|-------------|------|-----------|------|
| Board President | `board_president` | Sam President | Sunset Condos | condo_718 |
| Unit Owner | `owner` | Olivia Owner | Sunset Condos | condo_718 |
| PM Company Admin | `pm_admin` | Pat PM | All 3 communities | mixed |
| CAM | `cam` | Cameron CAM | Sunset Condos | condo_718 |
| Board Member | `board_member` | Bianca Board | Sunset Condos | condo_718 |
| Tenant | `tenant` | Tyler Tenant | Sunset Condos | condo_718 |
| Site Manager | `site_manager` | Sierra Site | Sunset Ridge Apartments | apartment |

**Role routing:**
- Admin roles (`board_president`, `cam`, `board_member`, `site_manager`, `pm_admin`) → redirect to `/dashboard?communityId=X`
- Resident roles (`owner`, `tenant`) → redirect to `/mobile?communityId=X`

**IMPORTANT**: After agent-login, ALWAYS verify the response shows `allCommunities` is non-empty before proceeding. If it's empty, that role has no community membership — skip it and note it in the report.

### Viewport Configuration

**You MUST set the viewport to 1440x900 for desktop testing.** The sidebar only appears at viewport widths >= 1024px. At narrower widths, you get a hamburger menu instead.

For mobile testing, set viewport to 375x812.

### Community Context

The middleware resolves community from `?communityId=X` query params. When navigating directly to URLs, ALWAYS include the communityId param (e.g., `/documents?communityId=1`). If you lose community context (blank pages, redirect to `/select-community`), re-authenticate via agent-login.

**Community IDs** (from seed):
- `1` = Sunset Condos (condo_718)
- `2` = Palm Shores HOA (hoa_720)
- `3` = Sunset Ridge Apartments (apartment)

---

## CRITICAL RULES FOR BROWSER INTERACTION

### Waiting for Content
- **Every page load**: After navigating, ALWAYS wait 3-5 seconds for the page to fully render. Pages show skeleton loading screens (gray placeholder blocks) that replace with real content once API data loads.
- **After clicking buttons/links**: Wait 1-2 seconds for the response/navigation.
- **After form submissions**: Wait 2-3 seconds for the mutation to complete and the UI to update.
- **React Query caching**: The first visit to a page is slower than subsequent visits.
- **If you see skeletons**: Wait 3 more seconds and take another screenshot. Some pages make multiple API calls.

### Taking Screenshots
- Take a screenshot after EVERY page navigation to verify it loaded correctly.
- Take before/after screenshots when testing interactions (form submissions, modals, etc.).
- If a screenshot shows a skeleton/loading state, wait and take another screenshot.
- Save screenshots with descriptive names for the report.

### Handling Modals & Overlays
- **Onboarding Checklist**: Appears on the first dashboard visit as a card above the main content with "Finish setting up your community" header and 6 checklist items. Click the **X button** (top right of the card) or **"I'll handle this later"** link at the bottom to dismiss it so you can see the dashboard widgets beneath.
- **Demo Trial Banner**: May appear at the top of authenticated pages. This is expected for demo communities — note its presence but continue testing.
- **Upgrade Prompts**: If you click a nav item that shows a lock icon or upgrade prompt overlay, note the feature name and move on — that feature requires a paid plan.

### Navigation
- **Desktop (1440px viewport)**: Use the left sidebar navigation. The sidebar has sections: COMMUNITY, MANAGEMENT, ADMIN. Some items have expandable sub-menus (indicated by a `>` chevron).
- **Mobile (375px viewport)**: The mobile routes use a hub-and-spoke pattern — the `/mobile` home page shows cards linking to each feature (Documents, Announcements, Meetings, Maintenance, Payments). There is NO bottom tab bar — navigate by going back to `/mobile?communityId=X` or clicking back.
- Always include `?communityId=X` when navigating directly via URL.

### Error Recovery
- **Blank page**: Take a screenshot, note the URL, refresh the page.
- **Redirected to `/auth/login`**: Session expired. Re-authenticate via agent-login.
- **Redirected to `/select-community`**: Lost community context. Re-authenticate via agent-login.
- **404 or "Not Found"**: Log it as a bug with the exact URL.
- **Error state on page**: Screenshot, note the error message, continue.

---

## TEST EXECUTION PLAN

Execute each test phase in order. For each page/feature:
1. Navigate to the page (include `?communityId=X` in URL)
2. Wait 3-5 seconds for full render (no skeletons visible)
3. Take a screenshot
4. Note: Does the page render? Layout correct? Console errors?
5. Test key interactions (clicking buttons, opening modals, filling forms)
6. Take screenshots of interaction results
7. Log any issues found

**IMPORTANT**: Do NOT submit forms or create/modify/delete real data. Fill forms in to verify they work, but do NOT click submit/save/create buttons. The goal is to verify UI renders and interactive elements are functional.

---

## PHASE 1: Board President — Full Admin Feature Sweep (Sunset Condos)

**Login**: Authenticate as `board_president`, navigate to `/dashboard?communityId=1`

**Set viewport to 1440x900** for desktop testing.

The board president with `manager` role has broad admin access on a condo community. This phase does the comprehensive feature sweep.

### 1.1 Dashboard
- [ ] Verify dashboard loads with "Sunset Condos" and "Welcome, Sam"
- [ ] **Onboarding Checklist**: If visible (card with "Finish setting up your community"), verify 6 items listed (Upload compliance document, Add units, Invite board member, Review compliance score, Post announcement, Customize portal). Dismiss it by clicking X or "I'll handle this later"
- [ ] Verify dashboard widgets render after dismissing checklist:
  - **Recent Announcements** (may show empty state with "Keep your community informed")
  - **Upcoming Meetings** (should show seeded meetings with dates)
  - **Violations** widget (should show seeded violations: Noise, Unauthorized Modification, Parking, Pet Violation)
  - **Documents to Sign** widget (should show pending e-sign submissions)
- [ ] Verify header bar: search input, notification bell, user avatar (SP)
- [ ] Verify sidebar is visible with correct sections

### 1.2 Sidebar Navigation Audit
- [ ] Verify ALL sidebar items visible for this role:
  - **COMMUNITY**: Dashboard, Documents, Meetings, Announcements, Board, Operations
  - **MANAGEMENT**: Packages, Visitors, Payments (expandable), Report Violation (expandable)
  - **ADMIN**: Compliance, Residents, Contracts, E-Sign, Audit Trail
- [ ] Click "Collapse" button at bottom of sidebar — verify sidebar collapses to icon-only mode
- [ ] Click expand — verify sidebar returns to full width
- [ ] Verify user info at bottom: "Sam President / Manager"

### 1.3 Documents
- [ ] Click "Documents" in sidebar
- [ ] Verify page loads with: "Documents" heading, "Manage and view community documents" subtitle
- [ ] Verify action buttons: "Search", "E-Sign", "Upload Document"
- [ ] Verify document list renders (seeded documents) or proper empty state
- [ ] Verify document preview pane on the right side ("Select a document to preview")
- [ ] Click a document row (if any) — verify preview pane updates
- [ ] Click "Upload Document" — verify upload modal/form opens, then close it

### 1.4 Meetings
- [ ] Click "Meetings" in sidebar
- [ ] Verify meetings page renders with calendar or list view
- [ ] Verify seeded meetings appear (Board Meeting, Owner Meeting, etc.)
- [ ] Look for "New Meeting" or "Schedule Meeting" button — click it
- [ ] Verify form has: title, date/time, location, meeting type, description fields
- [ ] Close without submitting

### 1.5 Announcements
- [ ] Click "Announcements" in sidebar
- [ ] Verify announcement list or empty state renders
- [ ] Look for "New Announcement" or "Create" button
- [ ] If present, click it and verify form opens with: title, body/content, priority fields
- [ ] Close without submitting

### 1.6 Board Section
- [ ] Click "Board" in sidebar
- [ ] Verify board overview page renders
- [ ] Look for sub-navigation tabs: Elections, Forum, Polls
- [ ] **Elections tab**: Click it, verify election list or empty state, check for "Create Election" button
- [ ] **Forum tab**: Click it, verify thread list or empty state, check for "New Thread" button
- [ ] **Polls tab**: Click it, verify poll list or empty state, check for "Create Poll" button

### 1.7 Operations (Maintenance)
- [ ] Click "Operations" in sidebar
- [ ] Verify operations/maintenance page renders
- [ ] Check for maintenance request list or inbox view
- [ ] Navigate to submit maintenance request (may be via button or separate route)
- [ ] Verify form renders with: title, description, priority, category, photo upload fields

### 1.8 Packages
- [ ] Click "Packages" in sidebar (under MANAGEMENT)
- [ ] Verify package log or empty state renders
- [ ] Look for "Log Package" button — verify form opens if clicked

### 1.9 Visitors
- [ ] Click "Visitors" in sidebar
- [ ] Verify visitor management page renders
- [ ] Check for visitor registration form or "Add Visitor" button

### 1.10 Payments (Expandable)
- [ ] Click "Payments" in sidebar (has `>` chevron)
- [ ] Verify sub-items expand (Assessments, Finance)
- [ ] Click main Payments page — verify payment dashboard renders
- [ ] **Assessments**: Click sub-item, verify assessments page renders with list or empty state
- [ ] **Finance**: Click sub-item, verify finance dashboard renders with ledger or KPIs

### 1.11 Report Violation (Expandable)
- [ ] Click "Report Violation" in sidebar (has `>` chevron)
- [ ] Verify violation reporting page or sub-items render
- [ ] Check for violation report form with fields

### 1.12 Compliance
- [ ] Click "Compliance" in sidebar (under ADMIN)
- [ ] Verify compliance dashboard renders with:
  - Compliance score ring/badge (should show "COMPLIANT" or score)
  - Item counts ("X of Y items")
  - Filter pills: All, Overdue, Pending, Satisfied, N/A
  - Category breakdown: Governing Documents, Financial Records, Meeting Records, Insurance, Operations (each with X/Y progress bars)
  - Recent Activity feed at bottom
  - Export button
- [ ] Click a category row — verify it expands or shows detail
- [ ] Click on a specific checklist item — verify detail/action panel opens

### 1.13 Residents
- [ ] Click "Residents" in sidebar
- [ ] Verify resident list page renders
- [ ] Check for search/filter functionality
- [ ] Check for "Invite Resident" or "Add" button
- [ ] Click on a resident row if present — verify detail panel

### 1.14 Contracts
- [ ] Click "Contracts" in sidebar
- [ ] Verify contracts page renders with list or empty state

### 1.15 E-Sign
- [ ] Click "E-Sign" in sidebar
- [ ] Verify E-Sign landing page renders
- [ ] Look for tabs: Templates, Submissions (or similar)
- [ ] Navigate to Templates — verify template list or empty state
- [ ] Navigate to Submissions — verify submission list with seeded data
- [ ] Click on a submission if present — verify detail view

### 1.16 Audit Trail
- [ ] Click "Audit Trail" in sidebar
- [ ] Verify activity log page renders with entries or empty state
- [ ] Check for filter/search functionality

### 1.17 Notifications
- [ ] Click the notification bell icon in the header bar
- [ ] Verify notification center/dropdown opens
- [ ] Check for unread count badge
- [ ] Verify notification items render (may be empty)

### 1.18 Search
- [ ] Click the search bar in the header ("Search documents, residents, meetings...")
- [ ] Verify command palette / search overlay opens
- [ ] Type a query (e.g., "board") and verify results appear
- [ ] Close search

### 1.19 Settings
- [ ] Navigate to `/settings?communityId=1`
- [ ] Verify settings page renders
- [ ] **Account**: Navigate to account settings, verify profile info form
- [ ] **Billing**: Navigate to billing page, verify it renders
- [ ] **Notifications**: Check notification preference toggles render
- [ ] **Transparency**: Check transparency settings page
- [ ] **Export**: Check data export section, verify export button exists

### 1.20 Emergency Broadcasts
- [ ] Navigate to `/emergency?communityId=1`
- [ ] Verify emergency broadcast page renders (list or empty state)
- [ ] Look for "New Broadcast" button — verify form opens if clicked

### 1.21 Direct URL Navigation Test
Test these routes by navigating directly (tests middleware routing):
- [ ] `/violations?communityId=1` — violations management page
- [ ] `/violations/report?communityId=1` — violation report form
- [ ] `/maintenance?communityId=1` — maintenance requests
- [ ] `/maintenance/submit?communityId=1` — submit maintenance form
- [ ] `/finance?communityId=1` — finance dashboard
- [ ] `/assessments?communityId=1` — assessments page
- [ ] `/notifications?communityId=1` — notification center

---

## PHASE 2: Owner — Mobile Experience (Sunset Condos)

**Login**: Authenticate as `owner`, navigate to the portal URL (should be `/mobile?communityId=X`)

**Set viewport to 375x812** for mobile testing.

### 2.1 Mobile Home
- [ ] Verify mobile home loads with "Sunset Condos" header and "Miami, FL" subtitle
- [ ] Verify "YOUR SUMMARY" card shows: Announcements count, Open requests count, Next meeting date
- [ ] Verify hub navigation cards are visible:
  - Documents ("Budgets, minutes, bylaws")
  - Announcements ("Community updates")
  - Meetings ("Upcoming schedule")
  - Maintenance ("Submit a request")
  - Payments ("Balances and recent activity")
- [ ] Verify user avatar in top-right corner

### 2.2 Mobile Documents
- [ ] Tap "Documents" card
- [ ] Verify document list page renders
- [ ] Check for category grouping or filter
- [ ] Navigate back to mobile home

### 2.3 Mobile Announcements
- [ ] Tap "Announcements" card
- [ ] Verify announcement list or empty state renders
- [ ] Navigate back

### 2.4 Mobile Meetings
- [ ] Tap "Meetings" card
- [ ] Verify meeting list renders with seeded meeting data
- [ ] Navigate back

### 2.5 Mobile Maintenance
- [ ] Tap "Maintenance" card
- [ ] Verify maintenance request list or empty state
- [ ] Look for "New Request" or "Submit" button
- [ ] If present, tap it and verify form renders with: title, description, priority, photo upload fields
- [ ] Navigate back without submitting

### 2.6 Mobile Payments
- [ ] Tap "Payments" card
- [ ] Verify payments page renders (balance, history, or empty state)
- [ ] Navigate back

### 2.7 Mobile Notifications
- [ ] Navigate to `/mobile/notifications?communityId=1`
- [ ] Verify notification list renders

### 2.8 Mobile Search
- [ ] Navigate to `/mobile/search?communityId=1`
- [ ] Verify search interface renders
- [ ] Type a query and verify results

### 2.9 Mobile Settings & More
- [ ] Navigate to `/mobile/more?communityId=1`
- [ ] Verify "More" menu page renders with additional options
- [ ] Navigate to `/mobile/settings?communityId=1`
- [ ] Verify settings page renders with account options
- [ ] Navigate to `/mobile/settings/security?communityId=1`
- [ ] Verify security settings render

### 2.10 Mobile Help
- [ ] Navigate to `/mobile/help?communityId=1`
- [ ] Verify help center page renders
- [ ] Check sub-pages: `/mobile/help/manage`, `/mobile/help/contact`

### 2.11 Desktop Access Test (Owner)
**Set viewport back to 1440x900**
- [ ] Navigate to `/dashboard?communityId=1`
- [ ] Verify owner can access desktop dashboard
- [ ] **Audit sidebar**: Note which nav items are visible for the `resident` role vs the `manager` role from Phase 1. The owner should see FEWER items (no ADMIN section, limited MANAGEMENT items).
- [ ] Take a screenshot of the sidebar for comparison

---

## PHASE 3: PM Admin — Property Manager Dashboard

**Login**: Authenticate as `pm_admin`, navigate to portal URL

**Set viewport to 1440x900**

### 3.1 Verify Multi-Community Access
- [ ] Check agent-login response — pm_admin should have access to ALL 3 communities
- [ ] Navigate to `/dashboard?communityId=1` — verify Sunset Condos dashboard
- [ ] Navigate to `/dashboard?communityId=3` — verify Sunset Ridge Apartments dashboard (apartment type — different UI)

### 3.2 PM Dashboard
- [ ] Navigate to `/pm/dashboard/communities?communityId=1`
- [ ] Verify PM portfolio dashboard loads with community list
- [ ] Check for KPI cards / portfolio metrics table
- [ ] Verify community cards show for managed communities

### 3.3 PM Community Drill-Down
- [ ] Click on a community card to view its detail
- [ ] Verify community-specific dashboard within PM context

### 3.4 PM Reports
- [ ] Navigate to `/pm/reports?communityId=1`
- [ ] Verify report interface renders
- [ ] Check available report type options

### 3.5 PM Branding
- [ ] Navigate to `/pm/settings/branding?communityId=1`
- [ ] Verify branding form renders (logo upload, color customization, etc.)

### 3.6 Apartment Dashboard (Community Type Difference)
- [ ] Navigate to `/dashboard?communityId=3` (Sunset Ridge Apartments)
- [ ] Verify the apartment dashboard has a DIFFERENT layout than condo dashboard
- [ ] Check for apartment-specific features: Leases, Move In/Out
- [ ] **Audit sidebar for apartment community**: Verify these are ABSENT:
  - Compliance (apartments don't have it)
  - Violations / Report Violation (apartments don't have it)
- [ ] Verify these ARE present for apartments:
  - Documents, Meetings, Announcements, Operations
  - Packages, Visitors (apartments have these)
  - Leases (apartment-specific, condos don't have this)
  - E-Sign, Board

---

## PHASE 4: Additional Roles (If Available)

**For each role below**: Authenticate, verify the response shows communities, then test. **If `allCommunities` is empty, skip the role and log it as a data issue.**

### 4.1 CAM (`cam`)
- [ ] Authenticate as `cam`
- [ ] If communities exist: Navigate to dashboard, audit sidebar items
- [ ] Compare sidebar items to board_president — should be the same or similar
- [ ] If no communities: Log as "CAM role has no community membership — seed data issue"

### 4.2 Board Member (`board_member`)
- [ ] Authenticate as `board_member`
- [ ] If communities exist: Navigate to dashboard, audit sidebar items
- [ ] Verify board section access (Elections, Forum, Polls)
- [ ] Compare permissions to board_president
- [ ] If no communities: Log as data issue

### 4.3 Tenant (`tenant`)
- [ ] Authenticate as `tenant`
- [ ] If communities exist: Test mobile experience (similar to owner)
- [ ] Test desktop access — verify tenant sees FEWER features than owner
- [ ] Verify tenant CANNOT see admin sections
- [ ] If no communities: Log as data issue

### 4.4 Site Manager (`site_manager`)
- [ ] Authenticate as `site_manager`
- [ ] If communities exist: Test Sunset Ridge Apartments dashboard
- [ ] Verify apartment-specific features: Leases, Packages, Visitors, Move In/Out
- [ ] Verify absence of condo features: Compliance, Violations
- [ ] If no communities: Log as data issue

---

## PHASE 5: Public Pages (No Authentication)

Test these WITHOUT an active session. If you have a session, clear cookies first or use an incognito/private approach if available.

### 5.1 Landing Page
- [ ] Navigate to `http://localhost:3000/`
- [ ] Verify landing page renders with:
  - PropertyPro Florida logo/branding
  - Navigation: Features, Compliance, Pricing, Log In, Get Started
  - Hero section about Florida Statute §718.111(12)(g)
  - Feature cards: Document Management, Meeting Notices, Owner Portal, Mobile Access, Compliance Dashboard, Property Manager Tools
  - Compliance timeline section
  - Pricing section (if visible)
  - Footer
- [ ] Click "Log In" — verify it navigates to login page
- [ ] Navigate back to landing page
- [ ] Click "Get Started" — verify it navigates to signup page

### 5.2 Login Page
- [ ] Navigate to `/auth/login`
- [ ] Verify login form renders with:
  - "Sign in to PropertyPro" heading
  - Email input field
  - Password input field
  - "Sign In" button
  - "Create your account" link
  - "Forgot password?" link
- [ ] Verify links work (navigate to signup and forgot-password pages)

### 5.3 Forgot Password
- [ ] Navigate to `/auth/forgot-password`
- [ ] Verify form renders with:
  - "Reset your password" heading
  - Email address input with placeholder
  - "Send reset link" button
  - "Remember your password? Log in" link

### 5.4 Signup Page
- [ ] Navigate to `/signup`
- [ ] Verify signup form renders with ALL fields:
  - Primary Contact Name, Email, Password
  - Community Name, Address, County, Unit Count
  - Community Type selector: Condominium (718), HOA (720), Apartment
  - Plan Selection: Essentials ($199/month), Professional ($349/month)
  - Subdomain input (your-community.getpropertypro.com)
  - Terms of Service & Privacy Policy checkbox
  - "Create Account" button
  - "Already have an account? Sign in" link
- [ ] Verify community type cards are selectable (click each one)
- [ ] Verify plan cards are selectable
- [ ] Do NOT submit the form

### 5.5 Legal Pages
- [ ] Navigate to `/legal/privacy` — verify Privacy Policy page renders with content
- [ ] Navigate to `/legal/terms` — verify Terms of Service page renders with content
- [ ] Verify both pages have navigation between Terms and Privacy

### 5.6 Transparency Page
- [ ] Navigate to `/transparency`
- [ ] Verify public transparency page renders

---

## PHASE 6: Cross-Cutting Concerns

### 6.1 Responsive Layout
Authenticate as `board_president` first.
- [ ] At 1440px: Verify sidebar is visible, content uses full width
- [ ] Set viewport to 768px (tablet): Verify sidebar collapses, hamburger menu appears
- [ ] Set viewport to 375px (mobile): Verify content reflows, no horizontal scrolling
- [ ] Open hamburger menu at mobile width — verify sidebar opens as a drawer/overlay
- [ ] Set back to 1440px

### 6.2 Sidebar Collapse/Expand
- [ ] At desktop width, click "Collapse" button at bottom of sidebar
- [ ] Verify sidebar collapses to icon-only mode (nav icons still visible)
- [ ] Click expand — verify sidebar returns to full width with labels
- [ ] Verify active page is highlighted (blue background) in sidebar

### 6.3 Expandable Nav Items
- [ ] Click "Payments" chevron — verify sub-menu expands with Assessments and Finance
- [ ] Click "Report Violation" chevron — verify sub-menu expands
- [ ] Click again to collapse

### 6.4 Error States
- [ ] Navigate to `/dashboard/nonexistent?communityId=1`
- [ ] Verify proper error or 404 page renders (not blank)
- [ ] Navigate to `/api/v1/nonexistent` — verify JSON error response

### 6.5 Session Persistence
- [ ] After authenticating, reload the page (F5)
- [ ] Verify session persists and dashboard loads correctly

### 6.6 Community Switching
- [ ] Navigate to `/select-community`
- [ ] Verify community selection page renders with available communities
- [ ] If multiple communities available, select a different one
- [ ] Verify dashboard loads for the selected community

---

## REPORTING FORMAT

After completing all phases, provide a structured test report:

```markdown
## Test Report: PropertyPro Full Application Test
Date: [date]
Tester: Cursor AI

### Environment
- Dev server: localhost:3000
- Seed data: [yes/no, any issues]
- Roles tested: [list roles that had community access]
- Roles skipped: [list roles with no community membership]

### Summary
- Total features tested: X
- Passed: X
- Failed: X
- Warnings: X
- Not testable: X

### Phase Results

#### Phase 1: Board President (Admin Sweep)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Dashboard | PASS/FAIL | ... |
| 1.2 | Sidebar Navigation | PASS/FAIL | ... |
| 1.3 | Documents | PASS/FAIL | ... |
...

#### Phase 2: Owner (Mobile)
...

### Bugs Found
1. **[P0/P1/P2]** Description — URL: /path — Expected: X — Actual: Y
2. ...

### Warnings / Observations
1. Description of non-blocking issues
2. ...

### Features Not Testable
1. Feature — Reason (e.g., "File upload — native OS dialog")
2. ...

### Seed Data Issues
1. Role — Issue (e.g., "CAM — no community membership in user_roles table")
2. ...
```

### Severity Definitions
- **P0 (Critical)**: Page crashes, blank screen, data loss, broken navigation, authentication bypass, security issue
- **P1 (High)**: Feature doesn't work, UI blocks interaction, missing essential data, wrong role access
- **P2 (Medium)**: UI glitch, cosmetic issue, slow load, minor alignment, non-essential feature broken

---

## FEATURES KNOWN TO BE UNTESTABLE VIA BROWSER AUTOMATION

Note these as "Not Testable" in your report — do NOT attempt them:

| Feature | Reason | What to verify instead |
|---------|--------|----------------------|
| File uploads | Native OS file picker dialog | Verify upload button/drag-drop zone renders |
| Stripe payments | Requires real Stripe keys | Verify payment UI / Stripe Connect buttons render |
| Email sending (Resend) | External service | Verify "send" buttons and email form fields exist |
| SMS / Twilio | External service | Verify emergency broadcast compose form renders |
| Google Calendar sync | Requires OAuth flow | Verify "Connect Google Calendar" button exists |
| ICS feed download | Browser can't trigger downloads | Verify download link/button exists |
| PDF viewing | PDF.js may not render in automated browser | Note if viewer loads or shows error |
| DocuSeal e-signature | External signing service | Verify e-sign UI shell and submission list render |
| Data export | Can't verify file downloads | Verify export buttons exist |
| Phone verification | Requires Twilio SMS | Verify phone input form renders |
| Accounting integration | External OAuth | Verify connect/disconnect buttons exist |
| Password reset email | Requires email delivery | Verify form submits without error |

---

## EXECUTION TIPS

1. **Set viewport FIRST**: Before any testing, set viewport to 1440x900 for desktop phases.
2. **Verify auth before testing**: After every agent-login, check the JSON response for `allCommunities`. If empty, skip that role.
3. **Include communityId**: When navigating via URL, ALWAYS append `?communityId=X`. Without it, you'll get redirected to `/select-community`.
4. **Dismiss onboarding checklist**: On first dashboard visit, dismiss the checklist so you can see the actual dashboard widgets.
5. **Wait for data**: Skeleton screens (gray placeholder blocks) mean data is loading. Always wait for real content before screenshotting.
6. **Be methodical**: Complete one phase entirely before moving to the next.
7. **Screenshot everything**: Take a screenshot for every page and every interaction — they're your evidence.
8. **Console errors matter**: Check browser console for JavaScript errors (React hydration errors, failed API calls, unhandled promise rejections).
9. **If stuck**: Re-authenticate via agent-login and continue from where you left off.
10. **Don't submit forms**: Fill them in to verify fields, but do NOT click submit/save/create buttons.

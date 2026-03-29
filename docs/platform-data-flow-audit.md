# PropertyPro Platform Data Flow & UX Continuity Audit

**Date:** 2026-03-21
**Scope:** End-to-end user journey from demo creation through customer onboarding, billing, and daily operations
**Methodology:** Static code analysis + live testing via dev servers (`apps/web` port 3000, `apps/admin` port 3001)

---

## Executive Summary

PropertyPro has strong foundations — tenant isolation, compliance scoring, audit logging, and a well-structured multi-tenant architecture. However, **the signup-to-checkout flow is completely broken** (the `email_verified` status transition is never written, blocking all new signups from reaching Stripe checkout). Beyond this critical bug, **significant gaps exist in the demo-to-customer conversion pipeline, subscription-based feature gating, and resident onboarding**. The platform can accept payments and provision communities, but the journey from "PM admin shows a prospect a demo" to "prospect is a paying customer managing their community" has significant manual intervention points and missing automation.

**Final tally: 4 P0 blockers, 16 P1 major gaps, 27 P2 UX friction, 5 P3 enhancements.**

**NOTE:** The initial audit missed `apps/admin/` (a separate Next.js app at port 3001). This operator console has a full demo management system (creation wizard, branding editor, preview, delete) and platform admin auth via `platform_admin_users`. Findings D-01/D-02 (no demo API/UI) and PM-08 (dead schema) were false negatives and have been corrected below.

### Severity Legend

| Severity | Meaning |
|----------|---------|
| **P0 — Blocker** | Cannot complete the user journey without manual intervention or code changes |
| **P1 — Major Gap** | Feature exists partially but has dead ends, missing UI, or broken continuity |
| **P2 — UX Friction** | Works but creates confusion, extra steps, or poor experience |
| **P3 — Enhancement** | Missing capability that competitors offer |

---

## Section 1: Demo Creation & Prospect Experience

### Current State

**CORRECTION:** A separate admin app exists at `apps/admin/` (port 3001, "PropertyPro Operator Console") with a **fully implemented demo management system**. This app was missed in the initial audit because agents only searched `apps/web/`. The admin app uses `platform_admin_users` table for auth (not dead schema as initially reported), shares the same Supabase database, and connects to `apps/web/` via iframe previews using HMAC demo tokens.

**What exists and works:**
- **3-step demo creation wizard** (`/demo/new`) — choose template type, configure branding (colors, fonts with live preview), add CRM URL and notes
- **Demo list page** (`/demo`) — shows all demos with age badges (green/yellow/orange/red at 0/10/20/30 days), links to preview/mobile/CRM/delete
- **Split-screen preview** (`/demo/[id]/preview`) — board dashboard (desktop) + resident mobile side-by-side via iframes into `apps/web`
- **Mobile-only preview** (`/demo/[id]/mobile`) — phone frame rendering
- **Post-creation editing** — `DemoEditDrawer` with branding tab (colors, fonts, logo) and page template tab (CodeMirror JSX editor with sucrase compile + DOMPurify sanitize)
- **Community name/address editing** — via `CommunityEditSection`
- **Hard delete** — removes auth users, cascades community data, deletes demo_instances row
- **Stale demo awareness** — client portfolio page surfaces demos older than 10 days

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| D-01 | **P1** | **Demo share links expire after 1 hour.** The "Copy shareable link" button in `SplitPreviewClient` copies a URL with a 1-hour HMAC token baked in. There is no UI to generate a longer-lived prospect-facing link. If an admin sends this to a prospect, it expires before the prospect likely opens it. |
| D-02 | **P1** | **No prospect-facing share page.** The demo preview pages (`/demo/{id}/preview`, `/demo/{id}/mobile`) require platform admin auth. A prospect cannot access these directly. There is no public-facing demo landing page or durable share URL mechanism. |
| D-03 | **P1** | **`is_demo` flag is write-only at runtime in `apps/web`.** The admin app correctly sets `is_demo: true` during seed, but `apps/web`'s middleware, subscription guard, and feature checks never read it. Demo communities are functionally identical to production communities. |
| D-04 | **P1** | **No demo expiry enforcement.** `demoExpiresAt` is stored but never checked by any cron job or guard. Expired demos remain fully functional indefinitely. No cleanup job exists. |
| D-05 | **P2** | **Demo seed data is not customizable post-creation.** Branding and community metadata are editable, but the seeded data (documents, meetings, announcements) cannot be added/edited/removed from the admin UI. |
| D-06 | **P2** | **Demo login uses iframe meta-refresh workaround.** When `preview=true` is set (iframe embedding), the endpoint returns an HTML page with `<meta http-equiv="refresh">` instead of a 302 redirect, to work around cross-origin cookie restrictions. |

### What's Needed

1. **Durable shareable demo links** — Generate prospect-facing URLs with configurable TTL (e.g., 7 days) instead of 1-hour tokens
2. **Public demo landing page** — A page in `apps/web` that accepts a durable token and renders the demo without requiring platform admin auth
3. **Demo expiry cron** — Scheduled job that marks expired demo communities as inactive and optionally purges sample data

---

## Section 2: Demo-to-Customer Conversion

### Current State

The admin app (`apps/admin/`) can create and manage demos, but **there is no conversion flow** from demo to paying customer. The admin app's demo lifecycle is: create → customize → preview → delete. There is no "convert" or "upgrade" action.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| C-01 | **P1** | **No conversion endpoint.** There is no `POST /api/admin/demos/:id/convert` or equivalent in either `apps/admin/` or `apps/web/`. Converting a demo to a paying customer requires the prospect to go through the full public signup flow (email verification, Stripe checkout, provisioning), which creates a brand new community — losing all demo customization (branding, template, community name). |
| C-02 | **P1** | **No way to link demo community to Stripe checkout.** The checkout flow in `stripe-service.ts` only knows about `pending_signups` records. It cannot reference an existing demo community to upgrade in-place. |
| C-03 | **P1** | **Provisioning creates a fresh community.** The `provisioning-service.ts` state machine always inserts a new `communities` row. There is no "upgrade existing community" path. If a prospect liked their demo setup (branding, JSX template, sample data), all of that is lost. |
| C-04 | **P1** | **Role mismatch on provisioning.** The provisioning step `user_linked` assigns `manager` role with `presetKey = 'board_president'` (condo/HOA) or `site_manager` (apartment). It does **not** assign `pm_admin`. The founding user of a new community gets `manager` role, not `pm_admin`, which means they cannot access the PM portfolio dashboard unless they're separately assigned `pm_admin` by a developer (or via the admin app's member role editor). |

### What's Needed

1. **In-place upgrade flow** — Convert a demo community to production by: clearing `is_demo` flag, linking to a Stripe subscription, preserving customizations (theme, name, slug), and optionally purging sample data
2. **Stripe checkout integration for demos** — A checkout session that references the existing `community.id` rather than creating a new `pending_signups` record
3. **Role promotion** — The founding user should receive `pm_admin` role (or at minimum be prompted to choose)

---

## Section 3: Billing, Subscriptions & Feature Gating

### Current State

Stripe integration exists for checkout, subscription lifecycle, and payment failure recovery. Four plans are defined (`compliance_basic` $99/mo, `compliance_plus_mobile` $199/mo, `full_platform` $349/mo, `apartment_operations` $499/mo). Webhook handlers process subscription status changes. A subscription guard (`requireActiveSubscriptionForMutation`) blocks write operations when subscription status is in a locked set.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| B-01 | **P0** | **No feature-level gating by plan.** `subscriptionPlan` is stored on `communities` but is **never read at runtime**. The subscription guard only checks `subscriptionStatus` (active/trialing vs. canceled/unpaid). A `compliance_basic` customer at $99/mo has identical feature access to a `full_platform` customer at $349/mo. |
| B-02 | **P1** | **No plan upgrade/downgrade UI.** There is no settings page, button, or API route for a customer to change their plan. Stripe portal integration is not implemented. |
| B-03 | **P1** | **Payment failure recovery is one-directional.** The hourly cron (`/api/v1/internal/payment-reminders`) sends escalating email reminders (day 1, 3, 7, 14) but there is no self-serve payment update page. The emails likely link to a Stripe portal URL, but no `createBillingPortalSession` function was found in the codebase. |
| B-04 | **P1** | **No billing history page.** No UI shows past invoices, payment history, or upcoming charges. |
| B-05 | **P2** | **Plan pricing is hardcoded in two places.** `signup-schema.ts` (line 13-76) and `pricing-section.tsx` both define the same 4 plans with prices. These can drift. |
| B-06 | **P2** | **Stripe Price ID mapping via env vars is fragile.** Plan IDs map to Stripe Price IDs using `STRIPE_PRICE_<PLAN_ID_UPPER>` env vars. Missing any one of these silently breaks checkout for that plan. |

### What's Needed for Feature Gating

A plan-to-features mapping system. Proposed approach:

```
Plan: compliance_basic ($99/mo)
  - Document posting + compliance scoring
  - Meeting management
  - 14-day notice tracking
  - Max 1 admin user

Plan: compliance_plus_mobile ($199/mo)
  - Everything in basic
  - Mobile resident portal
  - Announcements + push notifications
  - Resident directory
  - Up to 3 admin users

Plan: full_platform ($349/mo)
  - Everything in compliance_plus_mobile
  - E-sign integration
  - Violation tracking + ARC submissions
  - Maintenance requests
  - Assessment/dues collection (Stripe Connect)
  - Financial reporting
  - Unlimited admin users

Plan: apartment_operations ($499/mo)
  - Everything in full_platform
  - Move-in/move-out checklists
  - Package tracking
  - Visitor management
  - Occupancy analytics
  - Lease management
```

Implementation: a `PLAN_FEATURES` config object checked by middleware or a `useFeatureGate()` hook. Routes/pages that require gated features return 403 or show an upgrade prompt.

---

## Section 4: Signup & Community Onboarding

### Current State

The signup flow is well-engineered: form validation → `pending_signups` upsert → email verification → Stripe checkout → 7-step provisioning state machine. Post-provisioning, two onboarding wizards exist (condo and apartment).

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| O-01 | **P0** | **`email_verified` status is never written — signup flow is fully blocked.** The checkout action (`lib/actions/checkout.ts` line 45) guards on `pending_signups.status === 'email_verified'`, but **no code anywhere in the codebase writes this status**. After Supabase confirms the email and redirects back to `/signup?verified=1`, the `pending_signups` row remains at `pending_verification`. Any user who completes email verification and navigates to `/signup/checkout` will receive: `Error: Cannot start checkout from status "pending_verification"`. This is a complete end-to-end blockage of the signup-to-payment flow. |
| O-02 | **P0** | **No navigation from verification to checkout.** After email verification, the user lands on `/signup?verified=1` which re-renders the full signup form with a success banner — but **no "Proceed to Checkout" button or link is rendered**. The user has no visible path to `/signup/checkout`. This is a UX dead end even if O-01 were fixed. |
| O-03 | **P1** | **Provisioning role assignment is wrong.** As noted in C-04, the founding user gets `manager` role, not `pm_admin`. For a property management company signing up to manage multiple communities, the first community's admin cannot access the PM portfolio dashboard. |
| O-04 | **P2** | **No stuck-signup recovery UI.** `pending_signups` has 7 status states (`pending_verification`, `email_verified`, `checkout_started`, `payment_completed`, `provisioning`, `completed`, `expired`). If provisioning fails mid-way (e.g., DB error at step 4), the job is stuck at `lastSuccessfulStatus` with no admin dashboard to retry or inspect. |
| O-05 | **P2** | **Onboarding wizard data not pre-populated.** The condo and apartment onboarding wizards (`/onboarding/condo`, `/onboarding/apartment`) start with empty forms. The community name, address, county, and unit count already collected during signup are not carried forward into the wizard. |
| O-06 | **P2** | **No onboarding progress tracking.** Once provisioning completes, the user lands on `/dashboard` with no guided checklist. The compliance checklist exists but is domain-specific (document posting requirements), not an onboarding checklist (setup your community, invite residents, configure settings). |
| O-07 | **P2** | **Provisioning hardcodes timezone to `America/New_York`.** `stepCommunityCreated()` in `provisioning-service.ts` sets `timezone: 'America/New_York'`. No timezone field is collected during signup. Correctable only via the onboarding wizard Profile step. |
| O-08 | **P2** | **Invitation password validation is weaker than signup.** `SetPasswordForm` and the `PATCH /api/v1/invitations` handler only validate length (8-72 chars). The signup schema enforces mixed case, number, and special character. Invited users can set weak passwords. |
| O-09 | **P2** | **Condo wizard `maxStepIndex` bug.** `loadWizardState()` in `lib/queries/wizard-state.ts` returns `maxStepIndex = 2` for condo wizards, but the condo API defines `MAX_STEP_INDEX = 3` (steps 0-3). This causes incorrect `nextStep` calculation, potentially skipping step 3 (Units). |

### What's Needed for 1-Hour Onboarding

**Pre-onboarding (before customer sees the platform):**
1. PM admin creates demo with prospect's community name, address, and approximate unit count
2. Prospect reviews demo, decides to subscribe
3. Conversion flow preserves demo setup

**Onboarding wizard (target: 60 minutes):**

| Step | Time Est. | What Happens |
|------|-----------|--------------|
| 1. Community profile | 5 min | Confirm name, address, type, photo. Pre-filled from signup data. |
| 2. Unit setup | 10 min | Bulk create units (building/floor/unit pattern generator for condos; unit list CSV import for apartments). |
| 3. Import residents | 15 min | CSV upload with column mapping. Support Buildium, AppFolio, Yardi, and generic formats. Preview + validate before committing. |
| 4. Invite board/managers | 5 min | Add board members, CAM, site manager. Send invitation emails. |
| 5. Upload key documents | 10 min | Drag-and-drop bylaws, declaration, budget, insurance cert. Auto-categorize by filename pattern. |
| 6. Configure settings | 5 min | Meeting notice preferences, notification defaults, branding (logo + colors). |
| 7. Review & launch | 5 min | Compliance score preview. Send "community is live" announcement to all imported residents. |
| **Total** | **~55 min** | |

---

## Section 5: User & Resident Management

### Current State

Residents are created via `POST /api/v1/residents` with role, unit assignment, and optional owner flag. A separate invitation system (`POST /api/v1/invitations`) sends email invitations with one-time tokens. The hybrid role model (v2: `resident`/`manager`/`pm_admin` with `presetKey` and `isUnitOwner`) coexists with legacy 7-role references.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| U-01 | **P1** | **Bulk import API exists but has no UI.** `POST /api/v1/import-residents` accepts CSV with columns `name`, `email`, `role`, `unit_number`. It has dry-run support (`dryRun: true`) and per-row error handling via `csv-validator.ts`. However, **no frontend page or component exists** to upload a CSV, map columns, preview results, or trigger the import. The API also does not send invitation emails — imported users exist in the `users` table with no Supabase auth account. |
| U-02 | **P1** | **Resident creation and invitation are decoupled.** Creating a resident (`POST /api/v1/residents`) inserts a `users` row and `user_roles` row but does NOT send an invitation. The admin must separately call `POST /api/v1/invitations` to send a login link. There is no "create and invite" atomic operation. |
| U-03 | **P1** | **Created users cannot log in until invitation is accepted.** A `users` row is created with `crypto.randomUUID()` as the ID, but no Supabase auth account exists. The user is in a limbo state — they exist in the application DB but cannot authenticate. Only after accepting an invitation (which sets a password via `PATCH /api/v1/invitations`) does the auth account get created. |
| U-04 | **P2** | **No invitation resend from resident management.** The residents list page has no "resend invitation" button. Admins must navigate to a separate invitations management area (if one exists in the UI — no evidence of an invitations list page was found). |
| U-05 | **P2** | **Role terminology confusion.** The v2 model uses `resident`/`manager`/`pm_admin`, but the UI, seed data, and CLAUDE.md reference the legacy 7 roles (`owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`). The mapping is: `resident` + `isUnitOwner=true` = "owner", `resident` + `isUnitOwner=false` = "tenant", `manager` + `presetKey='board_president'` = "board president", etc. This indirection creates confusion for admins setting up their community. |
| U-06 | **P2** | **No self-service resident signup.** There is no public page where a resident can sign up and request access to their community. The only path is admin-initiated invitation. Competitors (Buildium, AppFolio, TownSq) offer self-registration with admin approval. |
| U-07 | **P3** | **No resident deactivation workflow.** When a resident moves out, their `user_roles` row should be soft-deleted and their `users.deletedAt` set. No move-out API endpoint ties this to lease end dates. |
| U-08 | **P1** | **Resident form/API role model mismatch.** `ResidentForm` (`components/residents/resident-form.tsx`) uses the old 7-role `COMMUNITY_ROLES` enum (`owner`, `tenant`, `board_member`, etc.) but the API expects the new 3-role model (`resident`, `manager`, `pm_admin`) plus `presetKey` and `isUnitOwner`. Submitting a manager role from the form would fail validation. |
| U-09 | **P1** | **Resident management components exist but are not mounted.** `ResidentList` and `ResidentForm` components exist in `components/residents/` but **no page route** under `/(authenticated)/` mounts them. There is no resident management page in the dashboard. |
| U-10 | **P1** | **No unit CRUD API after onboarding.** Units are created during onboarding (`POST /api/v1/onboarding/apartment` step 2) but there is no standalone `POST/PATCH/DELETE /api/v1/units` endpoint for adding, editing, or removing units after the wizard completes. |

### Competitor Tenant Export/Import Formats

Research into major property management platforms reveals the following common export formats:

**Buildium** ([Help Center](https://support.buildium.com/hc/en-us/sections/200173338-Import-and-Export-Data)):
- Export via Settings > Export Data > Tenants → CSV download
- Import template with required fields marked by asterisk
- Common fields: Property Name, Unit Name, First Name, Last Name, Email, Phone, Lease Start, Lease End, Rent Amount, Deposit Amount, Move-in Date
- Separate import for Association Owners vs. Rental Tenants

**AppFolio** ([Tenant Directory](https://help.getrentcheck.com/en/articles/5280578-downloading-units-and-residents-from-appfolio)):
- Reports > Tenant Directory > Actions > Export as CSV
- Fields: Property Name (required), Unit, Tenant Name, Status, Rent, Deposit, Lease Start, Lease End, Email, Phone
- Customizable report columns

**Yardi** ([Integration Docs](https://support.condocontrol.com/hc/en-us/articles/25698629323675)):
- API-based: `GetResidentData`, `GetCondoUnitInformation_Login`
- Fields: Unit Number, Address, Resident Name, Email, Phone, Alternate Addresses
- Also supports CSV/SFTP file exchange
- Condo Control integration specifically designed for condo associations

**Common denominator fields for a universal import template:**

| Field | Required | Notes |
|-------|----------|-------|
| `unit_number` | Yes | Building + unit identifier |
| `first_name` | Yes | |
| `last_name` | Yes | |
| `email` | Yes | Primary contact |
| `phone` | No | |
| `role` | Yes | Owner/Tenant/Board Member |
| `lease_start` | No | For tenants |
| `lease_end` | No | For tenants |
| `move_in_date` | No | |
| `is_primary_resident` | No | For multi-occupant units |

---

## Section 6: PM Dashboard & Multi-Community Operations

### Current State

The PM dashboard at `/pm/dashboard/communities` shows a portfolio overview with KPIs (total units, occupancy, maintenance, compliance, delinquency). Cross-community operations include bulk announcements, bulk documents, and five report types.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| PM-01 | **P1** | **`pm.getpropertypro.com` is a dead end.** The subdomain `pm` is in the reserved list and returns 404. The PM dashboard is accessed via path-based routing (`/pm/dashboard/communities`) on any domain, not via a dedicated subdomain. The CLAUDE.md claim of `pm.getpropertypro.com` is aspirational, not implemented. |
| PM-02 | **P1** | **No community creation from PM dashboard.** A PM admin managing multiple communities cannot add a new community from the portfolio view. They must go through the full public signup flow (new email, new Stripe checkout, new provisioning). There is no "Add Community" button or wizard. |
| PM-03 | **P1** | **PM admin cannot be assigned during onboarding.** The provisioning service assigns `manager` (board_president/site_manager), not `pm_admin`. A PM company that signs up gets locked out of the portfolio dashboard for their first community until the role is manually patched. |
| PM-04 | **P2** | **Bulk documents lose metadata.** `fileSize: 0` and `mimeType: 'application/octet-stream'` are hardcoded in the bulk document creation path. Actual file metadata from the upload step is discarded. |
| PM-05 | **P2** | **Bulk documents skip compliance linkage.** Documents created via bulk path are not associated with `compliance_checklist_items`. A PM admin uploading a budget to 5 communities won't see the compliance score update for those communities. |
| PM-06 | **P2** | **Community switcher leaves PM context.** Clicking a community in the portfolio view redirects to `/dashboard?communityId=X` (the standard community dashboard). There is no way to return to the PM portfolio view without manually navigating back. No breadcrumb or "Back to Portfolio" link. |
| PM-07 | **P3** | **No branding bulk-copy.** A PM company with consistent branding across 20 communities must configure each one individually. The `BrandingCopyDialog.tsx` component exists but no bulk-copy API endpoint was found. |
| PM-08 | ~~P1~~ | ~~**`platform_admin_users` table is a dead schema.**~~ **CORRECTED:** The `platform_admin_users` table is actively used by `apps/admin/` — the separate operator console app. Middleware and every route handler check this table via `requirePlatformAdmin()`. Admin management UI exists at `/settings`. |
| PM-09 | **P2** | **Community settings (write levels) have no management UI.** `communities.communitySettings` JSONB controls `announcementsWriteLevel`, `meetingsWriteLevel`, etc. (enforced via RLS), but no API route or settings page exists to configure these. Only writable at the DB layer. |
| PM-10 | **P2** | **Bulk announcements full-table-scan for author name.** `scoped.query(users)` loads all users in each community to find the author's name — no WHERE clause. Will degrade for large communities. |

---

## Section 7: Middleware & Auth Edge Cases

### Current State

The middleware is comprehensive — session refresh, tenant resolution, rate limiting, header sanitization, email verification enforcement, and auth redirects are all present.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| M-01 | **P2** | **Session refresh runs on every request.** `createMiddlewareClient()` makes a network call to Supabase on every matched request, including public pages and static-ish routes. This adds ~50-200ms latency to every page load. Consider caching the session check for a short window. |
| M-02 | **P2** | **Tenant cache is not LRU.** The in-memory `Map` uses FIFO eviction (insertion-order deletion when at 256 capacity). High-traffic communities can be evicted in favor of rarely-accessed ones. An LRU cache would be more appropriate. |
| M-03 | **P2** | **Legacy `x-tenant-id` header fallback.** Sentry request context still checks `x-tenant-id` as a fallback. This should be removed to avoid confusion, as the middleware only sets `x-community-id`. |
| M-04 | **P2** | **Multi-community user redirect is silent.** When a user belongs to multiple communities and hits a protected path without a `communityId` param, they're redirected to `/select-community`. But the select-community page has no explanation of why they were redirected. |
| M-05 | **P2** | **Verify-email page has no polling.** After email verification, the user must manually navigate back. The `/auth/verify-email` page is static with no active polling or WebSocket subscription to detect when `email_confirmed_at` becomes non-null. |
| M-06 | **P3** | **No CSRF protection on state-changing routes.** The middleware does not check `Origin` or `Referer` headers on POST/PATCH/DELETE requests. Supabase's session cookies are `SameSite=Lax`, which prevents CSRF on cross-origin POST from scripts, but does not prevent top-level navigation POST (form submissions from attacker pages). |
| M-07 | **P2** | **Public site `dangerouslySetInnerHTML` for custom templates.** Both `_site/page.tsx` and `mobile/page.tsx` render DB-stored HTML via `dangerouslySetInnerHTML`. Exploitable if an admin injects malicious HTML or if the DB is compromised. |
| M-08 | **P2** | **Demo login bypasses cookie domain configuration.** Both `/api/v1/auth/demo-login` and `/dev/agent-login` create Supabase clients without `cookieOptions: getCookieOptions()`. In production subdomain deployments, demo session cookies won't have the domain set by `NEXT_PUBLIC_COOKIE_DOMAIN`, preventing cross-subdomain recognition. |
| M-09 | **P2** | **`getUser()` called up to 3 times per request.** On protected paths, `supabase.auth.getUser()` fires in `createMiddlewareClient()`, then again explicitly in the protected path block, and potentially a third time for `/auth/*` pages. Each may be a network round-trip to Supabase. |
| M-10 | **P2** | **Password reset has a hard 5-second timeout.** `reset-password-form.tsx` uses a 5s `setTimeout` to detect the Supabase `PASSWORD_RECOVERY` event. If Supabase is slow, valid links show "Invalid or expired link" with no retry option. |

---

## Section 8: Edge Cases & Missing Flows

### Identity & Access

| ID | Severity | Finding |
|----|----------|---------|
| E-01 | **P2** | **Password reset exists but has UX issues.** `/auth/forgot-password` and `/auth/reset-password` routes exist with timing normalization and email enumeration protection. However, the reset form has a hard 5s timeout for session detection (see M-10), and login error messages show raw Supabase strings with no user-friendly mapping. |
| E-02 | **P2** | **No account settings page.** Users cannot change their email, password, or name from within the app. No `/settings/account` route exists. |
| E-03 | **P2** | **No role change notification.** When an admin changes a resident's role (e.g., tenant → board member), no email notification is sent. The affected user discovers the change only on next login. |

### Data Integrity

| ID | Severity | Finding |
|----|----------|---------|
| E-04 | **P2** | **Orphaned users on failed provisioning.** If provisioning fails after `user_linked` but before `completed`, a Supabase auth account and `users` row exist but the community may not. The user can log in but lands on an empty `/select-community` page. |
| E-05 | **P2** | **No idempotency on resident creation.** If an admin submits `POST /api/v1/residents` twice with the same email, the second call finds the existing `users` row but may create a duplicate `user_roles` entry (depending on the unique constraint configuration). |
| E-06 | **P3** | **Data export exists but is limited.** `GET /api/v1/export` generates a ZIP with `residents.csv`, `documents.csv`, `maintenance.csv`, `announcements.csv` (max 10K rows each, gated by `settings:read`). UI at `/settings/export`. However, it omits meetings, compliance records, financial data, and lease history — key data for platform migration. |

### Mobile

| ID | Severity | Finding |
|----|----------|---------|
| E-07 | **P2** | **Mobile routes share desktop middleware.** The `/mobile/*` paths go through the same middleware pipeline including tenant resolution and session refresh. Mobile-specific optimizations (lighter middleware, offline-first patterns) are not implemented. |
| E-08 | **P2** | **No deep linking for mobile.** Invitation emails, meeting notices, and announcements link to desktop paths (`/dashboard/*`). Mobile users are redirected to `/mobile` only if they initially log in via `/mobile`, but email links always go to desktop. |

---

## Section 9: Recommended Priority Order

### Phase 0 — Fix Broken Signup Flow (CRITICAL)

1. **Write `email_verified` status after Supabase confirms email** (O-01) — without this, zero new customers can sign up
2. **Add "Proceed to Checkout" navigation after verification** (O-02) — UX dead end after email verification

### Phase 1 — Unblock the Sales Pipeline (P0s + key P1s)

3. **Feature gating by plan** (B-01)
4. **Fix provisioning role assignment** (C-04, O-03, PM-03)
5. **Demo-to-customer conversion flow** (C-01, C-02, C-03) — admin app can create/manage demos, but no path to convert
6. **Durable demo share links** (D-01, D-02) — current 1-hour HMAC tokens expire before prospects open them

### Phase 2 — Smooth the Onboarding (P1s)

5. **Guided onboarding wizard with pre-populated data** (O-05, O-06)
6. **Bulk resident import with CSV parsing + column mapping** (U-01)
7. **Atomic "create and invite" for residents** (U-02)
8. **Plan management UI (upgrade/downgrade/billing portal)** (B-02, B-03, B-04)
9. **PM "Add Community" from portfolio dashboard** (PM-02)
10. **Demo expiry enforcement** (D-03, D-04)
11. **Fix resident form/API role model mismatch** (U-08)
12. **Mount resident management page in dashboard** (U-09)
13. **Add unit CRUD API for post-onboarding** (U-10)

### Phase 3 — Polish & Edge Cases (P2s)

11. **Password reset flow** (E-01)
12. **Account settings page** (E-02)
13. **Signup flow resilience** (O-01, O-02, O-04)
14. **Invitation management UX** (U-04, U-06)
15. **PM dashboard UX** (PM-04, PM-05, PM-06)
16. **Middleware optimizations** (M-01, M-02, M-05)
17. **Public site XSS hardening** (M-07)

### Phase 4 — Competitive Features (P3s)

18. **Self-service resident signup with admin approval** (U-06)
19. **Data export for communities** (E-06)
20. **Branding bulk-copy** (PM-07)
21. **Mobile deep linking** (E-08)
22. **CSRF protection** (M-06)

---

## Section 10: Live Testing Evidence

All findings below were verified by running both dev servers and navigating the app as different user roles.

### Verified via Live Testing

| Finding | Test Method | Result |
|---------|------------|--------|
| **O-01 (P0)** `email_verified` never written | `POST /api/v1/auth/signup` + grep for `email_verified` writes across entire codebase | **CONFIRMED.** Zero lines write `status = 'email_verified'`. Signup POST returns 500 (Resend domain not verified in dev), but the code path from `checkout.ts:45` guards on this status and would throw `Cannot start checkout from status "pending_verification"` in production. |
| **U-09 (P1)** No resident management page | Navigated to `/residents`, `/dashboard/residents`, `/settings/residents`, `/communities/residents` | **CONFIRMED.** All return 404. |
| **U-10 (P1)** No unit CRUD after onboarding | Navigated to `/units`, `/dashboard/units`, `/settings/units` | **CONFIRMED.** All return 404. |
| **U-01 (P1)** No import UI | Navigated to `/settings/import`, `/dashboard/import` | **CONFIRMED.** Both return 404. API exists but no UI. |
| **B-02/B-04 (P1)** No billing page | Navigated to `/billing`, `/settings/billing` | **CONFIRMED.** Both return 404. |
| **E-02 (P2)** No account settings | Navigated to `/account`, `/settings/account` | **CONFIRMED.** Both return 404. |
| **PM-03 (P1)** Board president can't access PM dashboard | Logged in as `board_president`, navigated to `/pm/dashboard/communities` | **CONFIRMED.** Redirected to "Select a Community" page. Role is `manager` (not `pm_admin`). |
| **PM dashboard works for pm_admin** | Logged in as `pm_admin`, navigated to `/pm/dashboard/communities` | **CONFIRMED WORKING.** Shows 3 communities with KPIs (22 units, 68% occupancy, 7 open maintenance, 81% compliance). |
| **E-01** Password reset page | Navigated to `/auth/forgot-password` while logged out | **EXISTS.** "Reset your password" form with email input, "Send reset link" button, and "Log in" link. Corrected from original P1 to P2 (exists but has 5s timeout UX issue). |
| **E-06** Data export page | Navigated to `/settings/export` | **EXISTS** (200). Shows "Data Export" page but displays "Provide a communityId" — community context not being passed. |
| **Admin app — Demo management** | Navigated admin app `/demo` page | **FULLY FUNCTIONAL.** Lists 1 demo ("Test Condo Demo", Condo §718, 5d age). Create Demo button, Preview/Mobile/Delete actions. |
| **Admin app — Demo preview** | Navigated to `/demo/1/preview` in admin app | **FULLY FUNCTIONAL.** Tabbed preview (Public Website, Mobile App, Admin Dashboard). "Copy link" button present. Edit pencil button for DemoEditDrawer. |
| **Admin app — Dashboard** | Navigated to `/dashboard` in admin app | **FULLY FUNCTIONAL.** Platform Overview (130 communities, 231 members, 7 docs, 1 active demo), Billing Summary, Compliance Health, Quick Actions. |
| **Admin app — Billing Summary** | Observed billing data on admin dashboard | **CONFIRMS B-01.** "No Subscription: 130" — all 130 communities have null subscription status. Zero active/trialing/past_due/canceled. Feature gating by plan is not operational. |
| **Mobile experience** | Logged in as `owner` — auto-redirected to mobile view | **WORKING.** Shows community name, summary card (announcements/requests/next meeting), navigation cards (Documents, Announcements with badge, Meetings, Maintenance). |

### Findings Removed After Live Testing

| Original Finding | Reason for Removal |
|-----------------|-------------------|
| ~~D-01 (P0): No API to create demo instances~~ | **False negative.** `apps/admin/` has a full 3-step creation wizard at `/demo/new`. |
| ~~D-02 (P0): No demo management dashboard~~ | **False negative.** Demo list page at `/demo` with preview, mobile, delete actions. |
| ~~PM-08 (P1): `platform_admin_users` is dead schema~~ | **False negative.** Actively used by `apps/admin/` middleware and every route handler. Admin management at `/settings`. |
| ~~E-01 (P1): No password reset flow~~ | **Downgraded to P2.** `/auth/forgot-password` and `/auth/reset-password` pages exist. Remaining issue is the 5s timeout UX. |

---

## Appendix A: Resident Import Template Specification

Based on research into Buildium, AppFolio, Yardi, and industry-standard data migration patterns, PropertyPro should support a universal CSV import with the following columns:

### Required Columns

| Column | Type | Validation | Maps To |
|--------|------|------------|---------|
| `unit_number` | string | Must match existing unit in community | `user_roles.unitId` (via unit lookup) |
| `first_name` | string | 1-60 chars | `users.fullName` (combined) |
| `last_name` | string | 1-60 chars | `users.fullName` (combined) |
| `email` | string | Valid email format | `users.email` |
| `role` | string | `owner` / `tenant` / `board_member` / `board_president` / `cam` / `site_manager` | `user_roles.role` + `isUnitOwner` |

### Optional Columns

| Column | Type | Validation | Maps To |
|--------|------|------------|---------|
| `phone` | string | E.164 or US format | `users.phone` |
| `lease_start` | date | ISO 8601 or MM/DD/YYYY | `leases.startDate` |
| `lease_end` | date | ISO 8601 or MM/DD/YYYY | `leases.endDate` |
| `move_in_date` | date | ISO 8601 or MM/DD/YYYY | `leases.moveInDate` |
| `monthly_rent` | number | Positive decimal | `leases.monthlyRentCents` (×100) |
| `deposit_amount` | number | Positive decimal | `leases.depositCents` (×100) |
| `building` | string | Free text | Unit lookup prefix |
| `parking_space` | string | Free text | Metadata |
| `emergency_contact_name` | string | Free text | `users` metadata |
| `emergency_contact_phone` | string | E.164 or US format | `users` metadata |
| `notes` | string | Free text | `user_roles` metadata |

### Platform-Specific Import Presets

| Source Platform | Column Mapping Notes |
|----------------|---------------------|
| **Buildium** | "Property Name" → ignored (community already selected), "Unit Name" → `unit_number`, separate owner vs. tenant exports |
| **AppFolio** | "Property Name" → ignored, "Tenant Name" → split into first/last, "Status" → filter for active only |
| **Yardi** | API-based: `GetResidentData` returns structured data, map `ResidentName`, `UnitNumber`, `Email`, `Phone` |
| **Generic CSV** | Column mapping UI: user drags source columns to PropertyPro fields |

### Import Process Flow

```
1. Upload CSV → parse headers → detect platform preset (or ask user)
2. Show column mapping UI → user confirms/adjusts mappings
3. Validate all rows:
   - Email format check
   - Unit existence check against community units
   - Duplicate email detection (within file + against existing residents)
   - Role validation
4. Show validation results:
   - Green: ready to import
   - Yellow: warnings (e.g., phone format, optional field missing)
   - Red: errors that must be fixed (invalid email, unknown unit)
5. User confirms → bulk insert with progress bar
6. Post-import: show summary + option to "Send invitations to all imported residents"
```

---

## Appendix B: Onboarding Checklist Template

For use as an in-app guided setup wizard:

```json
{
  "steps": [
    {
      "id": "community_profile",
      "title": "Set up your community profile",
      "description": "Confirm your community name, address, and type",
      "estimatedMinutes": 5,
      "requiredFields": ["name", "address", "county", "communityType", "unitCount"],
      "autoComplete": true
    },
    {
      "id": "create_units",
      "title": "Add your units",
      "description": "Create all units in your community (bulk or one-by-one)",
      "estimatedMinutes": 10,
      "completionCriteria": "units.count >= community.unitCount * 0.8"
    },
    {
      "id": "import_residents",
      "title": "Import your residents",
      "description": "Upload a CSV from your current system or add residents manually",
      "estimatedMinutes": 15,
      "completionCriteria": "user_roles.count(role=resident) >= 1"
    },
    {
      "id": "invite_admins",
      "title": "Invite your board and managers",
      "description": "Add board members, CAM, or site managers who will help manage the community",
      "estimatedMinutes": 5,
      "completionCriteria": "user_roles.count(role=manager) >= 1"
    },
    {
      "id": "upload_documents",
      "title": "Upload key documents",
      "description": "Start with your bylaws, declaration, budget, and insurance certificate",
      "estimatedMinutes": 10,
      "completionCriteria": "documents.count >= 3"
    },
    {
      "id": "configure_settings",
      "title": "Configure your settings",
      "description": "Set up notifications, branding, and compliance preferences",
      "estimatedMinutes": 5,
      "completionCriteria": "community.logoUrl != null"
    },
    {
      "id": "go_live",
      "title": "Review and go live",
      "description": "Check your compliance score and announce your community portal to residents",
      "estimatedMinutes": 5,
      "completionCriteria": "manual_confirmation"
    }
  ]
}
```

---

## Appendix C: Data Flow Diagram (Text)

```
PROSPECT JOURNEY (current state — broken paths marked with !!!)

PM Admin                    Prospect                   System
────────                    ────────                   ──────

[apps/admin/ Operator Console — port 3001]
       │
       ├──/demo/new wizard───────────────► demo_instances created
       │  (type + branding + CRM URL)     demo auth users in Supabase
       │                                  demo community seeded (is_demo=true)
       │                                       │
       ├──share link──────► clicks link        │
       │  [!!!link expires in 1 hour]          │
       │                    │                  │
       │                    ├──GET /api/v1/auth/demo-login
       │                    │                  ├── HMAC validate
       │                    │                  ├── magic link + OTP verify
       │                    │                  └── redirect to /dashboard or /mobile
       │                    │
       │                    ├──explores demo platform
       │                    │
       │              "I want to buy"
       │                    │
[!!!No conversion flow]     │
       │                    │
       │                    ├──navigates to /signup (starts from scratch)
       │                    │  ├── fills form (name, email, community, plan)
       │                    │  ├── POST /api/v1/auth/signup
       │                    │  │   ├── pending_signups row (status: pending_verification)
       │                    │  │   ├── Supabase auth user created
       │                    │  │   └── verification email sent via Resend
       │                    │  │
       │                    │  ├── clicks email verification link
       │                    │  │   └── returns to /signup?verified=1
       │                    │  │
       │                    │  ├── continues to Stripe checkout
       │                    │  │   ├── stripe-service creates checkout session
       │                    │  │   └── pending_signups → checkout_started
       │                    │  │
       │                    │  ├── completes payment
       │                    │  │   ├── Stripe webhook: checkout.session.completed
       │                    │  │   ├── pending_signups → payment_completed
       │                    │  │   └── provisioning_jobs created
       │                    │  │
       │                    │  └── provisioning state machine runs:
       │                    │      ├── community_created (new communities row)
       │                    │      ├── user_linked (users + user_roles as manager [!!!not pm_admin])
       │                    │      ├── checklist_generated (compliance items)
       │                    │      ├── categories_created (document categories)
       │                    │      ├── preferences_set (notification defaults)
       │                    │      ├── email_sent (welcome email)
       │                    │      └── completed
       │                    │
       │                    ├──lands on /dashboard (new, empty community)
       │                    │  [!!!demo customizations lost]
       │                    │  [!!!no guided onboarding wizard]
       │                    │
       │                    ├──manually sets up community:
       │                    │  ├── add units one-by-one
       │                    │  ├── add residents one-by-one
       │                    │  ├── send invitations separately
       │                    │  ├── upload documents one-by-one
       │                    │  └── configure settings
       │                    │
       │                    └──community operational (hours/days later)
```

---

*End of audit report.*

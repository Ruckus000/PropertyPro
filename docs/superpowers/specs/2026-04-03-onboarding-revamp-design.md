# Onboarding Revamp — Design Spec

**Date:** 2026-04-03
**Status:** Design approved, pending implementation plan
**Goal:** Rebuild onboarding to accelerate time-to-value, activate both admin and invited users, and deliver an experience that inspires confidence on day one.
**Timeline:** Ship this week

---

## Table of Contents

1. [Design Decisions](#1-design-decisions)
2. [Streamlined Admin Wizard](#2-streamlined-admin-wizard)
3. [In-Dashboard Onboarding Checklist](#3-in-dashboard-onboarding-checklist)
4. [Invited User Welcome Screen](#4-invited-user-welcome-screen)
5. [Empty States Strategy](#5-empty-states-strategy)
6. [Celebrations & Feedback](#6-celebrations--feedback)
7. [Bug Fixes](#7-bug-fixes)
8. [Dependencies](#8-dependencies)
9. [Data Model Changes](#9-data-model-changes)
10. [Design System Compliance](#10-design-system-compliance)
11. [Files to Create or Modify](#11-files-to-create-or-modify)

---

## 1. Design Decisions

Locked decisions from the brainstorming process:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Both admin and invited user onboarding | Multi-user activation is the strongest retention signal. Organizations with multiple activated users churn at 1/3 the rate. |
| Wizard strategy | Streamline to 2 steps, hand off to dashboard checklist | Current 4-5 step wizard takes 10-20 minutes. New flow targets under 2 minutes. Setup moves to the dashboard where it happens in-context. |
| Invited user experience | Role-tailored welcome screen | Single focused page, personalized by role, showing real community data. Wins over users who didn't choose the product. |
| Tone | Confident & Clear | Professional warmth. Feels like a sharp colleague walking you through it. No fluff, no corporate stiffness, no emojis. |
| Cold-start solution | Seed compliance template structure | Dashboard shows what's *needed* as actionable "missing" items. Score starts at 0% but the dashboard is full of actionable items. Never empty. |
| Celebrations | One big milestone moment, rest is subtle | canvas-confetti burst when all checklist items complete. Smooth score animations and sonner toasts for individual actions. |
| Welcome signal | Checklist item existence | No `welcomed_at` column. If a user has zero rows in `onboarding_checklist_items`, they haven't been through the welcome flow yet. |

---

## 2. Streamlined Admin Wizard

**Replaces:** The current 4-5 step wizard (`/onboarding/condo` and `/onboarding/apartment`).

**Layout:** Same minimal layout as today (no sidebar/topbar). Clean, focused. Progress indicator showing "Step 1 of 2."

### Step 1 — Community Profile (~30 seconds)

Pre-filled from signup data (community name, address, county). The user confirms and optionally adds:
- Timezone (dropdown, defaulting to `America/New_York`)
- Logo (file upload)

If the user changes nothing and confirms, the step auto-completes.

**Copy:**
- Heading: *"Let's confirm your details"*
- Subtext: *"Then we'll take you to your dashboard."*

**Behavior:**
- Pre-populated fields show filled state with a subtle check
- "Continue" button is enabled immediately (all required fields are pre-filled)
- On submit: PATCH to community profile endpoint, advance to step 2

### Step 2 — Your Compliance Overview (~60 seconds)

A purpose-built screen previewing the compliance structure seeded during provisioning. This is the aha accelerator — the user sees the shape of their compliance obligations for the first time.

**What it shows:**
- Heading: *"Here's what Florida requires for your community"*
- Subtext: *"We've mapped [12] document categories based on [§718 / §720 / your community type]. Your dashboard will track progress against these requirements."*
- A list of the seeded compliance checklist categories with their status shown as "Needed" — not empty, not error, just informational
- Each category shows: icon + category name + "Needed" badge using the `calm` compliance escalation tier (subtle neutral treatment)
- No uploads, no data entry. Read-only.

**CTA:** Single prominent button — *"Go to your dashboard"*

**On completion:**
- Sets `onboarding_wizard_state.status = 'completed'`
- Creates the admin's `onboarding_checklist_items` rows (6 items)
- Redirects to `/dashboard?communityId={id}`

### What moves out of the wizard

| Former wizard step | New location |
|-------------------|-------------|
| Statutory document upload | Dashboard checklist: "Upload your first compliance document" |
| Branding (colors, fonts) | Dashboard checklist: "Customize your portal" |
| Unit roster | Dashboard checklist: "Add your units" |
| Rules upload (apartment) | Dashboard checklist: "Upload community rules" |
| Invite first resident (apartment) | Dashboard checklist: "Invite your first resident" |

### Skip behavior

The skip button is removed. A 2-step wizard where step 1 is pre-filled and step 2 is read-only doesn't need a skip. If the user navigates away, the wizard state saves and resumes on next visit. The wizard only shows when `onboarding_wizard_state.status` is `in_progress` or absent.

### Community type handling

Both condo/HOA and apartment flows use the same 2-step wizard. The difference:
- Step 2 shows different compliance categories based on `communityType` (already handled by `getComplianceTemplate()`)
- Apartment communities see operational categories instead of statutory compliance categories
- The admin checklist item #1 differs: condo/HOA gets `upload_first_document` (*"Upload your first compliance document"*), apartment gets `upload_community_rules` (*"Upload your community rules"*). Same `item_key` pattern, different display text and auto-complete trigger (document upload in the rules category)

---

## 3. In-Dashboard Onboarding Checklist

### Placement

A persistent card at the top of the dashboard, above all other content. First thing the user sees after the wizard completes.

### Admin Checklist (pm_admin / cam / board_president) — 6 items

| # | item_key | Display text | Auto-completes when | Why this order |
|---|----------|-------------|-------------------|----------------|
| 1 | `upload_first_document` | Upload your first compliance document | Any document is uploaded to this community | Quick win that moves the compliance score from 0% |
| 2 | `add_units` | Add your units | First unit is created | Unlocks resident features, unit-level tracking |
| 3 | `invite_first_member` | Invite a board member or resident | First invitation is sent | Multi-user activation — strongest retention signal |
| 4 | `review_compliance` | Review your compliance score | User visits compliance page after score > 0% | THE aha moment payoff |
| 5 | `post_announcement` | Post your first announcement | First announcement is published | Establishes communication loop |
| 6 | `customize_portal` | Customize your portal | Branding settings are saved | Nice-to-have, doesn't block value |

### Board Member Checklist — 3 items

| # | item_key | Display text | Auto-completes when |
|---|----------|-------------|-------------------|
| 1 | `review_announcement` | Review the latest announcement | User views an announcement |
| 2 | `check_compliance` | Check community compliance status | User visits compliance page |
| 3 | `update_preferences` | Update your notification preferences | Notification preferences are saved |

### Owner/Tenant Checklist — 3 items

| # | item_key | Display text | Auto-completes when |
|---|----------|-------------|-------------------|
| 1 | `review_announcement` | Review your community's latest announcement | User views an announcement |
| 2 | `access_document` | Access a community document | User views or downloads a document |
| 3 | `update_preferences` | Update your notification preferences | Notification preferences are saved |

### Visual design

- **Container:** `--surface-card`, `1px` border `--border-default`, `radius-md`, padding `space-5`. E0 default.
- **Progress bar:** At top of card. Track: `--surface-muted`. Fill: `--interactive-primary`. Text: *"2 of 6 complete"* in `text-sm`, `--text-secondary`. Fill animates with `transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1)`.
- **Each item:** Flex row. Left: 20px circle. Unchecked: `1.5px` border `--border-default`. Checked: filled `--status-success-fg` with white check icon, smooth 200ms fill animation. Right: item text in `text-base`, `--text-primary`. Checked items: text gets `--text-tertiary` with strikethrough.
- **Action button:** Each unchecked item has a subtle action link (right-aligned) in `text-sm`, `--interactive-primary`, verb-first label. Navigates to relevant page or opens contextual action.
- **Spacing:** `space-3` gap between items. `space-4` between progress bar and item list.

### Dismissal

- *"I'll handle this later"* link at bottom of card in `text-sm`, `--text-secondary`
- Collapses to a compact progress ring in the sidebar nav: *"Setup: 2/6"* with a circular progress indicator
- Clicking the ring re-expands the full checklist on the dashboard
- When all items complete: transitions to celebration state (Section 6), then auto-dismisses after acknowledgment

### Auto-completion hooks

Each relevant API route gets a lightweight hook that checks and updates `onboarding_checklist_items`:

```
POST /api/v1/documents        → completes 'upload_first_document'
POST /api/v1/units             → completes 'add_units' (on first unit)
POST /api/v1/residents/invite  → completes 'invite_first_member'
GET  /api/v1/compliance        → completes 'review_compliance' (if score > 0)
POST /api/v1/announcements     → completes 'post_announcement'
PATCH /api/v1/communities/branding → completes 'customize_portal'
GET  /api/v1/announcements/:id → completes 'review_announcement'
GET  /api/v1/documents/:id     → completes 'access_document'
PATCH /api/v1/notification-preferences → completes 'update_preferences'
```

Each hook: check if `completed_at` is null for the matching `item_key` + `user_id` + `community_id`. If so, set `completed_at = now()`. Fire-and-forget (non-blocking). Wrapped in try-catch so a checklist failure never breaks the primary action.

---

## 4. Invited User Welcome Screen

### When it appears

After an invited user accepts their invitation, sets their password, and logs in for the first time. The system checks: does this user have any rows in `onboarding_checklist_items`? If not, route to `/welcome`. The welcome screen is the only code path that creates checklist items for invited users.

### Layout

Full-page, no sidebar. Community branding (logo, primary color) is present but subtle — a small logo mark and accent-tinted elements. The page has breathing room.

### Structure (3 sections, single scroll)

#### Section 1: The Greeting

- **Community logo:** 48px square, `radius-md`, community's `primaryColor` background (falls back to `--interactive-primary` if no branding configured)
- **Heading:** *"[First name], welcome to [Community Name]"* — `text-2xl`, `font-weight: 600`, `--text-primary`
- **Subtext** varies by role:
  - **Owner:** *"Your community portal is set up. Here's what's here for you."*
  - **Tenant:** *"Everything about your residence, in one place."*
  - **Board member:** *"Your board has moved governance online. Here's where things stand."*
- Centered, generous whitespace. `space-10` below heading section.

#### Section 2: The Snapshot (2-3 cards, role-specific)

Real data from the community — not instructions, not a tour. Uses `--surface-card` cards with `--border-default`, `radius-md`, padding `space-5`, E0 rest, E1 hover.

Each card has: icon container (36px, `radius-sm`, semantic background tint) + label (`text-sm`, uppercase, `--text-secondary`) + content + optional action link (`text-sm`, `--interactive-primary`).

**Owner cards:**

| Card | Content | Data source |
|------|---------|-------------|
| Your community | Community name (`text-lg` title), type (Condominium / §718), unit count, management company name. Inline meta row with icon + text pairs, subtle dividers. | `communities` table — always populated |
| Latest from your board | Most recent announcement: title + truncated body + "Read full announcement" link. Empty: *"No announcements yet — you'll see them here when your board posts updates."* | `announcements` query, limit 1 |
| Community compliance | Compliance score gauge (52px ring, `stroke-dashoffset` animated, color from compliance escalation tier) + *"Your community is tracking X of Y required document categories."* | Compliance calculator |

**Board member cards:**

| Card | Content |
|------|---------|
| Compliance overview | Score gauge + *"X items need attention — Y overdue, Z due within 30 days"* + "View compliance details" link |
| Recent activity | Summary of recent document uploads, meeting notices, announcements. *"2 documents uploaded this week, 1 meeting notice posted"* |
| Your responsibilities | Pending action items if any. Empty: *"Nothing pending right now. You'll see action items here when they come up."* |

**Tenant cards:**

| Card | Content |
|------|---------|
| Your residence | Unit number (`text-lg` title), bed/bath/sqft, role label. Data from user's assigned unit. |
| Community rules & documents | *"House rules, lease addendums, and community documents are available here."* + "Browse documents" link |
| Need something? | *"Submit a maintenance request or reach out to management directly from here."* + "Submit a request" link |

#### Section 3: The Nudge

- **CTA button:** *"Go to your dashboard"* — `primary` variant, `lg` size (48px), centered. Arrow icon right.
- **Below it:** Compact preview of the role-appropriate checklist (3 items shown with unchecked circles). Label: *"A few things to explore when you're ready"* in `text-sm`, `--text-secondary`. Container: `--surface-card`, `--border-default`, `radius-md`, padding `space-5`.

### On "Go to your dashboard" click

1. Create the user's role-appropriate checklist items in `onboarding_checklist_items`
2. Redirect to `/dashboard?communityId={id}`
3. The user now has checklist items, so they'll never see the welcome screen again

### Edge cases

| Scenario | Behavior |
|----------|----------|
| Community has no data (admin just set up) | Snapshot cards gracefully show contextual copy: *"Your board is still getting things set up. You'll see updates here soon."* — honest, not apologetic. |
| Branding not configured | Page uses PropertyPro default tokens. No broken layout. |
| User navigates away before clicking CTA | No checklist items created. Welcome screen shows again on next login. |
| User's role changes after first login | Checklist items are already created. No re-welcome. Role change doesn't trigger a new welcome screen. |

### Animations

- Cards fade in with a slight upward translate (12px), staggered by 100ms per card. Duration 300ms, `ease-out`.
- Respects `prefers-reduced-motion`: cards appear immediately without animation.
- Compliance gauge ring animates its `stroke-dashoffset` on mount, 800ms, `motion.expressive` easing.

---

## 5. Empty States Strategy

### Principles

- Every empty screen does three things: explains what belongs here, why it matters, and gives a direct path to fill it
- Tone is "Confident & Clear" — states what goes here, not "Oops, nothing found"
- Role-aware copy: admins see action-oriented CTAs, non-admins see factual status
- Empty states use the existing `EmptyState` component pattern from `docs/design-system/patterns/EmptyState.tsx`

### New empty state configs

Add to `EMPTY_STATE_CONFIGS` in `apps/web/src/lib/constants/empty-states.ts`:

```typescript
no_residents: {
  title: "Add the people in your community",
  description: "Import residents via CSV or add them one by one. They'll get portal access to view documents and announcements.",
  actionLabel: "Add Residents",
  icon: "users",
},
no_meetings: {
  title: "Schedule and track board meetings",
  description: "Post meeting notices with the required advance notice. PropertyPro tracks the compliance timeline for you.",
  actionLabel: "Schedule Meeting",
  icon: "bell",
},
no_announcements_yet: {
  title: "No announcements yet",
  description: "Your board hasn't posted any announcements. You'll be notified when they do.",
  icon: "bell",
},
```

### Existing config changes

**Rename `compliance_new_association` → `compliance_empty`** and update copy:

```typescript
compliance_empty: {
  title: "Your compliance tracker is ready",
  description: "We've mapped the categories Florida requires. Upload documents to start tracking your score.",
  actionLabel: "Upload First Document",
  icon: "upload",
},
```

This config is currently dead code (defined but never referenced). Renaming and updating avoids duplication.

### Role-aware empty state copy

Documents page (already has role-aware handling via `canManage`):
- **Admin sees:** *"Your compliance documents live here"* + "Upload Document" button
- **Non-admin sees:** *"No documents available"* — factual. Does not promise documents will appear (they may exist but be role-restricted).

Announcements page:
- **Admin sees:** existing `no_announcements` config (*"Keep your community informed"* + "Create Announcement")
- **Non-admin sees:** new `no_announcements_yet` config (*"No announcements yet"* — factual)

### Empty state ↔ checklist relationship

When an admin completes a checklist item (e.g., uploads a document), the corresponding empty state disappears and is replaced by the real data view. Both the empty state and the checklist item point at the same action. No coordination code needed — the data view naturally replaces the empty state when data exists.

---

## 6. Celebrations & Feedback

### The Big Celebration (checklist completion)

**Trigger:** All admin checklist items have `completed_at` set. Detected on next render.

**Visual:**
1. Checklist card transforms into a success card
2. `canvas-confetti` burst fires from two origin points (left: `{x: 0, y: 0.7}`, right: `{x: 1, y: 0.7}`). 3-second sustained burst via `requestAnimationFrame` loop, 3 particles per side per frame. `confetti.reset()` cleanup after 5 seconds.
3. Animated check icon: 80px tinted circle (`--status-success-bg`), check draws on with 600ms `stroke-dashoffset` animation
4. Heading: *"Your community is set up"* (`text-lg`, `font-weight: 600`)
5. Description: *"You've uploaded documents, invited members, and your compliance score is live. [Community Name] is ready for your residents."* (`text-base`, `--text-secondary`)
6. Action: *"View Compliance Dashboard"* — `secondary` variant button
7. Card: `E1` elevation, `--surface-card`, `radius-md`

**Reduced motion:** Confetti is fully skipped (both `disableForReducedMotion: true` flag and manual `matchMedia` check). Check icon appears immediately without draw animation. Card transition still happens. Celebration is quieter but present.

**Dismissal:** Click action button or close icon (top-right, `36px` target, `--text-tertiary`). Permanent — the completed checklist state is the record.

**Implementation:**

```typescript
// apps/web/src/hooks/use-confetti.ts
'use client'
// Wraps canvas-confetti with:
// - useRef guard for React 18 Strict Mode double-fire prevention
// - prefers-reduced-motion check (matchMedia + library flag)
// - Auto-cleanup via confetti.reset() on unmount
// - Configurable duration (default 3000ms)
```

### Subtle Feedback

| Event | Feedback | Implementation |
|-------|----------|----------------|
| Checklist item auto-completes | Sonner toast: *"[Item name] — done"* with green check. Auto-dismisses 4s. | `toast.success()` from checklist event handler |
| Compliance score increases | Score number animates old → new. `tabular-nums` font feature. Gauge `stroke-dashoffset` transitions 800ms. | CSS transition on existing `compliance-score-ring.tsx` pattern |
| Checklist progress bar fills | `transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1)`. Fraction text updates after animation. | CSS transition |

### Sonner setup

- Install `sonner` package
- Add `<Toaster />` provider in the root layout (`apps/web/src/app/layout.tsx`)
- Configure: `position="top-right"`, `richColors`, theme-aware (respects design system)
- Toast calls: `toast.success("Upload your first compliance document — done")` from auto-complete hooks

---

## 7. Bug Fixes

### 7.1 Blank inviter name in invitation emails

**Problem:** `inviterName: ''` hardcoded in `invitations/route.ts` (line 118) and `onboarding-service.ts` (line 178). Email renders: *" has invited you to join..."* with a leading space and no name.

**Fix:**
1. Add `inviterName: string` parameter to `createOnboardingInvitation()` function signature
2. In `invitations/route.ts`: pass `fullName` from the authenticated request context (available via `x-user-full-name` header set by middleware)
3. In the onboarding route caller: pass `fullName` from the request context down through the call chain
4. Fallback chain: `fullName || email || 'Your administrator'`

**Scope:** Two callers updated, one function signature change. Zero new queries.

### 7.2 Dashboard greeting says "Welcome back" on first visit

**Problem:** `DashboardWelcome` always renders *"Welcome back, {firstName}"*.

**Fix:** Change to *"Welcome, {firstName}"*. First-visit users are handled by the new welcome screen (invited users) or wizard (admins) — by the time anyone reaches `DashboardWelcome`, they've been onboarded. "Welcome back" is inaccurate for second visits too (unnecessary familiarity).

**Scope:** One string change in `dashboard-welcome.tsx`.

### 7.3 Provisioning timeout shows false failure

**Problem:** `ProvisioningProgress` stops polling after 15 attempts (30 seconds) and shows failure, even if provisioning succeeds shortly after.

**Fix:**
1. Increase `MAX_POLLS` from 15 to 30 (60 seconds)
2. Add *"Check again"* button on failure state — resets `pollCount` and resumes polling for another 60 seconds
3. Add *"Or log in manually"* link to `/auth/login` below retry button

**Scope:** One component update (`provisioning-progress.tsx`). No backend changes.

### 7.4 "Wrong email? Go back" link drops signupRequestId

**Problem:** Link navigates to `/signup` without `signupRequestId`, so the form starts fresh.

**Fix:** Change href to `/signup?signupRequestId={signupRequestId}`. The signup form already handles this param for pre-population and resumption.

**Scope:** One href change in `verify-email-content.tsx`.

### Explicitly not in scope

| Bug | Rationale |
|-----|-----------|
| Hardcoded timezone `America/New_York` | Wizard Step 1 includes timezone selection. Not urgent. |
| HOA uses condo wizard with no differentiation | Intentional — compliance templates already differ by type. |

---

## 8. Dependencies

### New packages

| Package | Size | Purpose |
|---------|------|---------|
| `sonner` | ~3KB gzip | Toast notifications. shadcn-recommended. Provider + `toast()` calls. |
| `canvas-confetti` | ~6KB gzip | Confetti animation. Industry standard (GitHub, Vercel, Stripe). Zero deps. |
| `@types/canvas-confetti` | dev only | TypeScript definitions |

### No other new dependencies

The design intentionally uses existing infrastructure:
- `EmptyState` component (exists)
- Compliance score ring (exists)
- Design system tokens (exist)
- `onboarding_wizard_state` table (exists)
- Invitation email template (exists, just needs `inviterName` populated)

---

## 9. Data Model Changes

### New table: `onboarding_checklist_items`

```sql
CREATE TABLE onboarding_checklist_items (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id, item_key)
);

-- RLS policy: users can read/write their own checklist items within their community
-- Write-scope trigger: enforce_community_scope
-- Index for fast lookup
CREATE INDEX idx_checklist_user_community ON onboarding_checklist_items(user_id, community_id);
```

**Valid `item_key` values:**

Admin (condo/HOA): `upload_first_document`, `add_units`, `invite_first_member`, `review_compliance`, `post_announcement`, `customize_portal`

Admin (apartment): `upload_community_rules`, `add_units`, `invite_first_member`, `review_compliance`, `post_announcement`, `customize_portal`

Board member: `review_announcement`, `check_compliance`, `update_preferences`

Owner/Tenant: `review_announcement`, `access_document`, `update_preferences`

### No changes to existing tables

- `users` table: no new columns (welcome signal is checklist item existence)
- `onboarding_wizard_state`: no schema change (status values unchanged, behavior changes in application code)
- `communities`: no changes
- `pending_signups`: no changes

### Migration numbering

Current last migration: `0130_add_in_app_muting_columns.sql`. New migration should be `0131_add_onboarding_checklist_items.sql`. Verify journal index before creating.

---

## 10. Design System Compliance

Every component in this spec adheres to the PropertyPro design system:

### Spacing
- All values from the 4px grid: `space-1` through `space-16`
- Component internals: `inline`/`stack`/`inset` semantic spacing
- Dashboard sections: `space-y-6`, consistent with existing dashboard layout

### Colors & Surfaces
- All colors from semantic CSS variables: `--text-primary`, `--surface-card`, `--border-default`, `--interactive-primary`, `--status-*`
- No raw hex values in components
- Borders first, shadows second: E0 default cards, E1 on hover/celebration
- E2/E3 reserved for overlays only (not used in onboarding components)

### Typography
- Headings: `text-2xl` (24px) for page headings, `text-lg` (18px) for card titles
- Body: `text-base` (16px) minimum — never smaller for primary content
- Labels: `text-sm` (13px) for secondary labels
- Section labels: `text-xs` (11px) for metadata only (uppercase, `--text-tertiary`)
- `tabular-nums` for all numeric displays (scores, counters, progress)

### Radius
- `radius-sm` (6px): icon containers, inputs
- `radius-md` (10px): cards, buttons, logo container
- `radius-lg` (16px): modals only (not used in onboarding)
- `radius-full` (9999px): checklist circles, progress ring, badges

### Status Communication
- Compliance gauge: icon + text + color (never color alone)
- Compliance escalation tiers: `calm` (>30d), `aware` (8-30d), `urgent` (1-7d), `critical` (overdue)
- Status configs from `getStatusConfig()` for consistent labels

### Accessibility
- `:focus-visible` ring on all interactive elements (2px solid, 2px offset)
- Touch targets: 44px mobile, 36px desktop minimum
- All decorative icons: `aria-hidden="true"`
- `prefers-reduced-motion` respected: confetti skipped, card animations disabled, check icon appears immediately
- `role="status"` on sonner toast container (`aria-live="polite"`)
- Checklist progress: announced to screen readers via `aria-label` on progress bar

### UX Writing
- Empty state titles: encouraging, action-oriented (*"Your compliance tracker is ready"*, not *"No data found"*)
- Error messages: what happened + what to do
- Button labels: verb-first (*"Upload Document"*, *"Add Residents"*, *"View Compliance Dashboard"*)

---

## 11. Files to Create or Modify

### New files

| File | Purpose |
|------|---------|
| `apps/web/src/app/(authenticated)/welcome/page.tsx` | Welcome screen route |
| `apps/web/src/components/onboarding/welcome-screen.tsx` | Welcome screen component (role-tailored) |
| `apps/web/src/components/onboarding/welcome-snapshot-cards.tsx` | Role-specific snapshot card sets |
| `apps/web/src/components/onboarding/onboarding-checklist.tsx` | Dashboard checklist component |
| `apps/web/src/components/onboarding/checklist-celebration.tsx` | Celebration state for completed checklist |
| `apps/web/src/components/onboarding/checklist-sidebar-indicator.tsx` | Collapsed progress ring for sidebar |
| `apps/web/src/components/onboarding/compliance-preview.tsx` | Wizard Step 2 compliance overview |
| `apps/web/src/hooks/use-confetti.ts` | Confetti hook wrapping canvas-confetti |
| `apps/web/src/hooks/use-onboarding-checklist.ts` | Hook for fetching and managing checklist state |
| `apps/web/src/lib/services/onboarding-checklist-service.ts` | Server-side checklist CRUD + auto-complete logic |
| `apps/web/src/app/api/v1/onboarding/checklist/route.ts` | Checklist API (GET items, POST complete item) |
| `packages/db/src/schema/onboarding-checklist-items.ts` | Drizzle schema for new table |
| `packages/db/migrations/0131_add_onboarding_checklist_items.sql` | Migration |

### Modified files

| File | Change |
|------|--------|
| `apps/web/src/components/onboarding/condo-wizard.tsx` | Rebuild as 2-step wizard |
| `apps/web/src/components/onboarding/apartment-wizard.tsx` | Rebuild as 2-step wizard (same structure) |
| `apps/web/src/app/api/v1/onboarding/condo/route.ts` | Update for 2-step flow + checklist creation on completion |
| `apps/web/src/app/api/v1/onboarding/apartment/route.ts` | Same |
| `apps/web/src/app/(authenticated)/dashboard/page.tsx` | Add welcome screen redirect logic + checklist component |
| `apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx` | Same |
| `apps/web/src/components/dashboard/dashboard-welcome.tsx` | Change "Welcome back" to "Welcome" |
| `apps/web/src/lib/constants/empty-states.ts` | Add 3 new configs, rename 1 |
| `apps/web/src/components/signup/provisioning-progress.tsx` | Increase timeout, add retry button |
| `apps/web/src/components/signup/verify-email-content.tsx` | Fix "wrong email" link to carry signupRequestId |
| `apps/web/src/app/api/v1/invitations/route.ts` | Pass inviterName from request context |
| `apps/web/src/lib/services/onboarding-service.ts` | Add inviterName param to createOnboardingInvitation |
| `apps/web/src/app/api/v1/documents/route.ts` | Add checklist auto-complete hook |
| `apps/web/src/app/api/v1/announcements/route.ts` | Add checklist auto-complete hook |
| `apps/web/src/app/api/v1/residents/invite/route.ts` | Add checklist auto-complete hook |
| `apps/web/src/app/api/v1/notification-preferences/route.ts` | Add checklist auto-complete hook |
| `apps/web/src/app/layout.tsx` | Add sonner `<Toaster />` provider |
| `packages/db/src/schema/index.ts` | Export new schema |
| `packages/db/migrations/meta/_journal.json` | Add new migration entry |

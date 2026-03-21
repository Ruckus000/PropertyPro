# Mobile Redesign — Warm Editorial

**Date:** 2026-03-20
**Status:** Design approved, pending implementation plan

## Problem

The current mobile web app (`/mobile/`) has solid technical foundations (safe-area handling, motion system, accessibility, touch targets) but the visual design is utilitarian and uninspiring. It reads like a functional prototype — flat cards with border dividers, a basic tab bar, small icon circles, and minimal visual hierarchy. For a consumer-facing product used by condo residents (many older), it needs a premium, easy-to-navigate experience.

## Design Direction

**Warm Editorial** — a blend of shadcn/Vercel's crisp minimalism with Apple's generous whitespace, bold typographic hierarchy, restrained color, and content-first layout. Optimized for older users with clear navigation affordances and large touch targets.

**Key principles:**
- No emojis — all icons are Lucide SVG
- No time-of-day greetings — header space is for community identity and action
- Warm stone palette (`stone-*` Tailwind shades) instead of cold zinc/gray
- Personality through typography, spacing, and card craft — not decoration
- Hub-and-spoke navigation (no persistent bottom tab bar)

## Navigation Model

**Before:** 5-tab bottom navigation (Home, Documents, Meetings, Announcements, More) with persistent tab bar consuming screen real estate.

**After:** Hub-and-spoke. Home is the central hub with clear entry points to each section. Sub-pages use a back arrow to return to Home. No persistent tab bar — full screen real estate for content.

**Back navigation pattern:**
- Back arrow (chevron-left) + page title in a slim header bar
- Tapping back returns to Home
- Profile accessed via avatar tap on Home screen (navigates to Profile page)

## Screen Specifications

### 1. Home — Admin/Board View

**Header area:**
- Community name displayed as a bold typographic statement: 28px, weight 700, letter-spacing -0.5px, line-height 1.1
- Stacked on two lines for long names (e.g., "Sunset\nCondos")
- Location subtitle: 12px, stone-400, weight 500 (sourced from community `city` + `state` fields in the communities table; `loadDashboardData` must be extended to include these)
- Profile avatar: 44px circle, stone-100 background, stone-200 border, initials in stone-500 (meets 44px min touch target)

**Feature card (compliance — admin roles only):**
- White card on stone-50 page background
- 1px stone-200 border, 16px radius, subtle box-shadow (0 1px 3px rgba(0,0,0,0.04))
- 20px internal padding
- Compliance score: 36px weight 700, with "%" in 20px stone-400
- Circular progress indicator: 52px, 3px border in status color (green/amber/red), tinted background
- Stats row below a 1px divider: 3 metrics (new updates, open requests, next meeting) separated by 1px vertical dividers
- Stat values: 18px weight 600; labels: 11px stone-400

**Visible when:** user role is in `[board_member, board_president, cam, site_manager, property_manager_admin]` AND `features.hasCompliance === true`. This prevents showing the compliance card to `site_manager` in apartment communities where compliance tracking is disabled.

### 2. Home — Tenant/Owner View

Same header as admin. Feature card replaced with:

**Summary card:**
- Same card styling (white, bordered, rounded)
- Title: "Your Summary" in 11px uppercase stone-400
- Three stats in a horizontal row with vertical dividers: announcement count, open maintenance requests, next meeting date
- Stat values: 22px weight 700; labels: 11px stone-400

**No compliance score visible.**

### 3. Navigation List (shared on both Home variants)

Below the feature card, a list of navigation rows:

**Row structure:**
- 18px vertical padding per row, separated by 1px stone-100 bottom borders
- Left: Lucide icon in stone-500, stroke-width 1.8, 20px size
- 14px gap between icon and text
- Title: 16px weight 500, stone-900
- Description: 13px stone-400, 2px top margin
- Right: chevron-right icon in stone-300, 16px
- Optional: red notification badge (22px circle, white text) before chevron

**Sections:**
| Label | Icon | Description | Badge |
|-------|------|-------------|-------|
| Documents | file-text | Budgets, minutes, bylaws | — |
| Announcements | bell | Community updates | Total count (from `announcementCount` in dashboard data) |
| Meetings | calendar | Upcoming schedule | — |
| Maintenance | wrench | Submit a request | — |

Meetings row hidden for apartment communities (existing `hasMeetings` feature flag).

### 4. Documents

**Header:** Back arrow + "Documents" title

**Search bar:**
- 16px top padding
- Stone-100 background, 1px stone-200 border, 10px radius
- Search icon (stone-400) + placeholder text
- 12px horizontal padding, 14px font size

**Category filters:**
- Horizontal scrolling pill row, 14px below search
- Active pill: stone-900 background, white text
- Inactive: stone-100 background, 1px stone-200 border, stone-500 text
- 6px vertical / 14px horizontal padding, 20px radius (full pill), 12px weight 500
- Categories: All, Budgets, Minutes, Bylaws (dynamic based on community documents)

**Document list:**
- Each row: 36px icon container (8px radius, tinted background for actionable items, stone-100 for standard) + text block
- Title: 15px weight 500
- Meta: 12px stone-400 (category, file type, post date)
- Tags below meta when applicable: "Requires Signature" (blue), "New" (green), etc.
- Tags: 11px weight 500, 2px/8px padding, 6px radius, tinted bg + text color

**States:**
- **Empty:** "No documents yet" with file icon. Subtitle: "Documents will appear here when posted."
- **Loading:** Skeleton rows (3 placeholders)
- **Error:** "Couldn't load documents. Try again." with retry button

**Filter behavior:** If only one category exists, hide the filter row. If no documents exist, hide both search and filters.

### 5. Announcements

**Header:** Back arrow + "Announcements" title

**Pinned section:**
- Section title: "Pinned" in 11px uppercase stone-400, 0.8px letter-spacing
- Pinned items have a small pin indicator: pin icon (12px, amber-600) + "Pinned" text (11px weight 500, amber-600)

**Recent section:**
- Section title: "Recent"
- Standard list items: title (15px weight 500), meta line (12px stone-400: source + date)
- Action-needed tag on items requiring response (amber tinted)

**List item spacing:** 16px vertical padding, 1px stone-100 bottom borders

**States:**
- **Empty:** "No announcements yet" with bell icon. Subtitle: "Check back for community updates."
- **Loading:** Skeleton rows (3 placeholders)
- **Error:** "Couldn't load announcements. Try again." with retry button

### 6. Meetings

**Header:** Back arrow + "Meetings" title

**Upcoming section:**
- Elevated meeting cards (white background, 1px stone-200 border, 14px radius)
- 10px gap between cards
- Left side: meeting title (16px weight 600), date/time (13px stone-400), location (13px stone-400)
- Right side: date badge — mini calendar (stone-50 background, 1px stone-200 border, 10px radius)
  - Month: 11px uppercase weight 600 stone-400
  - Day: 22px weight 700 stone-900
- Footer area below 1px divider: action tags ("Agenda Available" blue, "RSVP Requested" amber)

**Past section:**
- Section title: "Past"
- Simple list items (no cards): title + date + "Minutes Posted" green tag

**States:**
- **Empty (upcoming):** "No upcoming meetings" with calendar icon. Subtitle: "Meetings will appear here when scheduled."
- **Empty (past):** Section simply not rendered
- **Loading:** Skeleton cards (2 placeholders)
- **Error:** "Couldn't load meetings. Try again." with retry button

### 7. Maintenance

**Header:** Back arrow + "Maintenance" title

**Request list:**
- Each row: title (15px weight 500), status tag, submission date (12px stone-400)
- Status tags: "Open" (amber), "In Progress" (blue), "Resolved" (green), "Closed" (gray)
- List item spacing: 16px vertical padding, 1px stone-100 bottom borders

**Submit action:**
- Primary action button at top of page, below header: "Submit Request" — full-width, `bg-stone-900 text-white`, 44px height, `rounded-md`
- 20px top margin from header

**States:**
- **Empty:** "No maintenance requests yet" with wrench icon. Action: "Submit your first request"
- **Loading:** Skeleton rows (3 placeholders)
- **Error:** "Couldn't load requests. Try again." with retry button

### 8. Profile & Settings

**Entry point:** Tapping the avatar on the Home screen

**Header:** Back arrow + "Profile" title

**Profile card:**
- Centered layout, 24px padding
- Avatar: 64px circle, stone-100, 2px stone-200 border, 22px initials
- Name: 20px weight 600, 12px below avatar
- Role: 13px stone-400
- Community: 13px stone-400

**Grouped settings (iOS-style inset groups):**
- White card containers with 1px stone-200 border, 12px radius
- Rows inside: 14px vertical/16px horizontal padding
- Lucide icons 18px, stone-500
- Title: 15px weight 500
- Chevron affordance on each row
- Groups separated by section titles (11px uppercase stone-400)

**Groups:**
1. **Account:** Edit Profile (user icon), Security (lock icon)
2. **Support:** Help Center (help-circle icon), Contact Management (message-square icon)

**Sign out:** `<button>` (not a link) that calls `supabase.auth.signOut()` then redirects to `/auth/login`. Centered text, 15px weight 500, red-600 color, 24px top margin.

## Color Palette

Use Tailwind utility classes throughout. The mobile layout should override the relevant CSS custom properties (e.g., `--surface-page`, `--surface-card`, `--text-primary`, `--text-secondary`, `--border-default`) to the warm stone equivalents so the semantic token layer stays intact.

**Semantic variable overrides for mobile:**
| Semantic Variable | Current Value | New Value (stone) | Tailwind Class |
|---|---|---|---|
| `--surface-page` | zinc-50 | stone-50 | `bg-stone-50` |
| `--surface-card` | white | white | `bg-white` |
| `--border-default` | zinc-200 | stone-200 | `border-stone-200` |
| `--border-subtle` | zinc-100 | stone-100 | `border-stone-100` |
| `--text-primary` | zinc-900 | stone-900 | `text-stone-900` |
| `--text-secondary` | zinc-400 | stone-400 | `text-stone-400` |

**Status tags:** Use `getStatusConfig()` from `docs/design-system/constants/status.ts` where possible. For tags not in the status system, use Tailwind classes:
- Blue: `bg-blue-50 text-blue-600`
- Amber: `bg-amber-50 text-amber-600`
- Green: `bg-emerald-50 text-emerald-600`
- Red (badges): `bg-red-600 text-white`
- Gray: `bg-stone-100 text-stone-500`

## Typography Scale

| Element | Size | Weight | Color | Extra |
|---------|------|--------|-------|-------|
| Community name | 28px | 700 | stone-900 | letter-spacing: -0.5px, line-height: 1.1 |
| Page title (back header) | 16px | 600 | stone-900 | — |
| Section title | 11px | 600 | stone-400 | uppercase, letter-spacing: 0.8px |
| Nav row title | 16px | 500 | stone-900 | — |
| Nav row description | 13px | 400 | stone-400 | — |
| List item title | 15px | 500 | stone-900 | — |
| List item meta | 12px | 400 | stone-400 | — |
| Feature card stat value | 18-22px | 600-700 | stone-900 | — |
| Feature card stat label | 11px | 400 | stone-400 | — |
| Compliance score | 36px | 700 | stone-900 | — |
| Tag text | 11px | 500 | varies | — |
| Profile name | 20px | 600 | stone-900 | — |
| Sign out | 15px | 500 | red-600 | — |

## Spacing System

All spacing uses the existing 4px base grid from `packages/ui/src/tokens/spacing.ts`.

- Page horizontal padding: 20px (space-5)
- Section vertical gaps: 20px (space-5)
- Card internal padding: 20px (space-5)
- Nav row vertical padding: 20px (space-5) — generous for older user touch targets
- List item vertical padding: 16px (space-4)
- Card border radius: 16px (`rounded-2xl`) for feature cards, 12px (`rounded-xl`) for settings groups and meeting cards
- Inter-card gap: 12px (space-3)
- Icon-to-text gap: 12px (space-3)
- Back header padding: 12px vertical, 16px horizontal

## Motion

Reuse the existing motion system from `apps/web/src/components/motion/`:

- **PageTransition** — fade + slide-up on route change (already exists)
- **SlideUp** — hero/feature card entrance with stagger delays
- **StaggerChildren + StaggerItem** — navigation list and content lists
- **PressScale** — tap feedback on navigation rows and cards (0.97x scale)

Motion respects `prefers-reduced-motion`: `StaggerItem` and individual wrappers use `useReducedMotion()` to suppress animations. The `MotionProvider` sets global defaults. Note: `StaggerChildren` container timing runs regardless of reduced-motion, but child items animate to zero — the visual result is correct.

## Accessibility

- All touch targets: 44px minimum height (existing requirement)
- Navigation rows: 18px padding + icon + text easily exceeds 44px
- Focus-visible rings on all interactive elements (existing)
- Chevrons provide clear "tappable" affordance for older users
- Descriptions on navigation items explain what each section contains
- Back arrow is large (20px icon in ~44px tap target)
- No color-only information — all status uses icon + text + color
- Pinned indicator uses icon + text label

## Role-Based Visibility

| Element | Tenant | Owner | Board Member+ | CAM/PM Admin |
|---------|--------|-------|---------------|--------------|
| Compliance card | Hidden | Hidden | Visible | Visible |
| Summary card | Visible | Visible | Hidden | Hidden |
| Documents | Visible | Visible | Visible | Visible |
| Announcements | Visible | Visible | Visible | Visible |
| Meetings | Community-dependent | Community-dependent | Community-dependent | Community-dependent |
| Maintenance | Visible | Visible | Visible | Visible |

Compliance card visible when: role in `[board_member, board_president, cam, site_manager, property_manager_admin]` AND `features.hasCompliance === true`

## Files to Modify

### Components to rewrite:
- `apps/web/src/components/mobile/MobileHomeContent.tsx` — new hub layout with role-based feature card
- `apps/web/src/components/mobile/MobileMoreContent.tsx` — becomes Profile & Settings page
- `apps/web/src/components/mobile/BottomTabBar.tsx` — remove entirely
- `apps/web/src/components/mobile/MobileTopBar.tsx` — remove entirely (replaced by in-page headers)
- `apps/web/src/components/mobile/CompactCard.tsx` — may be replaced or adapted

### New components:
- `apps/web/src/components/mobile/MobileBackHeader.tsx` — back arrow + title
- `apps/web/src/components/mobile/MobileNavRow.tsx` — reusable navigation row
- `apps/web/src/components/mobile/FeatureCard.tsx` — compliance (admin) or summary (tenant) card
- `apps/web/src/components/mobile/MobileDocumentsContent.tsx` — documents list page
- `apps/web/src/components/mobile/MobileAnnouncementsContent.tsx` — announcements list page
- `apps/web/src/components/mobile/MobileMeetingsContent.tsx` — meetings page
- `apps/web/src/components/mobile/MobileProfileContent.tsx` — profile & settings page

### Layout changes:
- `apps/web/src/app/mobile/layout.tsx` — remove BottomTabBar and MobileTopBar from shell
- `apps/web/src/styles/mobile.css` — update to warm stone palette, remove tab bar styles, add new component styles

### Pages (may need data fetching adjustments):
- `apps/web/src/app/mobile/page.tsx` — Home
- `apps/web/src/app/mobile/documents/page.tsx`
- `apps/web/src/app/mobile/announcements/page.tsx`
- `apps/web/src/app/mobile/meetings/page.tsx`
- `apps/web/src/app/mobile/more/page.tsx` — repurpose as Profile page (keep URL at `/mobile/more` to avoid breaking bookmarks; display title is "Profile")

### Existing utilities to reuse:
- `apps/web/src/components/motion/*` — all animation wrappers (PageTransition, SlideUp, StaggerChildren, PressScale)
- `apps/web/src/components/providers/motion-provider.tsx` — global motion config
- `packages/ui/src/tokens/motion.ts` — motion token values
- `apps/web/src/lib/utils/format-date.ts` — date formatting
- `apps/web/src/lib/utils/format-meeting-title.ts` — meeting title cleanup
- `apps/web/src/lib/services/compliance-alert-service.ts` — compliance data (note: no dedicated score service exists; compliance data is fetched via the compliance dashboard queries in `apps/web/src/app/mobile/page.tsx`'s `loadDashboardData`)
- `apps/web/src/components/compliance/compliance-score-ring.tsx` — existing animated score ring component
- Existing role checks and feature flag utilities

## Verification

1. Start dev server (`pnpm dev`) and open mobile routes
2. Log in as different roles via `/dev/agent-login?as=<role>`:
   - `owner` — should see summary card, no compliance
   - `tenant` — should see summary card, no compliance
   - `board_president` — should see compliance card
   - `cam` — should see compliance card
3. Verify hub-and-spoke navigation: tap each section, verify back arrow returns to Home
4. Verify no bottom tab bar is rendered
5. Verify Meetings row is hidden for apartment communities (`site_manager` role, Sunset Ridge)
6. Check accessibility: focus-visible rings, touch targets >= 44px, reduced-motion behavior
7. Run `pnpm typecheck` and `pnpm lint`
8. Run `pnpm test` for any affected unit tests

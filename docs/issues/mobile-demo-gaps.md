# Mobile Demo Gaps

Issues identified during Phase 4 review of the `/mobile/*` routes (P3-48/P3-49).

---

## Issue 1 — "More" tab links to nonexistent page (High)

**Title:** Mobile: /mobile/more page is missing — "More" tab returns 404

**Labels:** bug, mobile, P3

**Body:**

The `BottomTabBar` component defines a "More" tab linking to `/mobile/more`, but no corresponding `apps/web/src/app/mobile/more/page.tsx` exists. Tapping the "More" tab in the mobile demo (or inside the PhoneFrame iframe) produces a 404.

**Steps to reproduce:**
1. Navigate to any `/mobile/*` page
2. Tap the "More" tab in the bottom navigation bar
3. Observe 404

**Expected:** A "More" page with links to settings, profile, help, or logout.

**Affected file:** `apps/web/src/components/mobile/BottomTabBar.tsx:36`

---

## Issue 2 — Announcement detail route is missing (High)

**Title:** Mobile: tapping an announcement card returns 404 — no detail page exists

**Labels:** bug, mobile, P3

**Body:**

The mobile home page (`/mobile`) renders `CompactCard` components with `href` set to `/mobile/announcements/{id}?communityId=...`, but there is no dynamic route at `apps/web/src/app/mobile/announcements/[id]/page.tsx`. Tapping any announcement card in the demo results in a 404.

**Steps to reproduce:**
1. Navigate to `/mobile?communityId=1`
2. Tap any announcement card on the home page
3. Observe 404

**Expected:** An announcement detail page displaying the full announcement body.

**Affected file:** `apps/web/src/app/mobile/page.tsx:57`

---

## Issue 3 — Document cards are not tappable (Low)

**Title:** Mobile: document list cards have no link — cannot view or download documents

**Labels:** enhancement, mobile, P3

**Body:**

In `/mobile/documents`, the `CompactCard` components are rendered without an `href` prop, so they render as plain `<div>` elements. Users cannot tap to view or download a document. At minimum, cards should link to a download URL or a detail view.

**Affected file:** `apps/web/src/app/mobile/documents/page.tsx:69-76`

---

## Issue 4 — No loading skeletons for mobile routes (Medium)

**Title:** Mobile: no loading.tsx — white screen during server-side data fetch

**Labels:** enhancement, mobile, UX

**Body:**

All mobile pages use `export const dynamic = 'force-dynamic'` (server-rendered on every request) but no `loading.tsx` file exists under `apps/web/src/app/mobile/`. When loading data, especially inside the PhoneFrame iframe, users see a blank white screen with no feedback until the server response arrives.

**Expected:** A `loading.tsx` skeleton at the mobile layout level showing placeholder cards and a dimmed tab bar.

---

## Issue 5 — No status bar in PhoneFrame mockup (Low)

**Title:** Mobile: PhoneFrame lacks a fake status bar (time, signal, battery)

**Labels:** enhancement, mobile, UX

**Body:**

The `PhoneFrame` component renders a notch/Dynamic Island but no simulated iOS status bar. Adding a static status bar with hardcoded time, signal strength, and battery icons would improve demo realism for investor/sales presentations.

**Affected file:** `apps/web/src/components/mobile/PhoneFrame.tsx`

---

## Issue 6 — Duplicate auth checks on every mobile page (Low)

**Title:** Mobile: redundant auth + membership checks in layout and each page

**Labels:** performance, mobile, tech-debt

**Body:**

`apps/web/src/app/mobile/layout.tsx` already calls `requireAuthenticatedUserId()` and `requireCommunityMembership()`, but every child page (`page.tsx`, `documents/page.tsx`, `announcements/page.tsx`, etc.) repeats the exact same two checks. This doubles the database queries per page load.

Since the layout runs before the page, child pages can trust that auth has been validated. The duplicate calls should be removed from child pages, or the auth result should be passed via React context/props.

**Affected files:**
- `apps/web/src/app/mobile/layout.tsx`
- `apps/web/src/app/mobile/page.tsx`
- `apps/web/src/app/mobile/documents/page.tsx`
- `apps/web/src/app/mobile/announcements/page.tsx`
- `apps/web/src/app/mobile/maintenance/page.tsx`
- `apps/web/src/app/mobile/meetings/page.tsx`

---

## Issue 7 — No viewport meta tag control for standalone mobile access (Medium)

**Title:** Mobile: missing viewport meta tag for standalone mobile browser access

**Labels:** bug, mobile, accessibility

**Body:**

The mobile layout at `apps/web/src/app/mobile/layout.tsx` does not ensure a `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` tag is present. Inside the PhoneFrame iframe this is inherited from the parent page, but when a user visits `/mobile/*` directly on a real phone browser, the page may not scale correctly if the root layout omits it.

Verify the root `app/layout.tsx` includes the viewport meta, or add it explicitly to the mobile layout's metadata export.

# Mobile Settings & Help Pages — Design Spec

**Date:** 2026-03-20
**Branch:** mobile-design-polish
**Status:** Approved

## Overview

Build out the 4 "Coming soon" rows on the mobile Profile page (`/mobile/more`) into fully functional routes: Edit Profile, Security, Help Center, and Contact Management. Add an admin-only FAQ management page. Wire all routes into the existing `MobileProfileContent.tsx`.

## Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/mobile/settings` | Edit Profile — personal info + notifications + accessibility + SMS consent | Authenticated |
| `/mobile/settings/security` | Security — inline password change + forgot password link | Authenticated |
| `/mobile/help` | Help Center — FAQ accordion with search | Authenticated |
| `/mobile/help/contact` | Contact Management — community contact info display | Authenticated |
| `/mobile/help/manage` | FAQ Management — admin CRUD for FAQ topics | Admin only |

## Data Layer

### New `faqs` Table

```sql
CREATE TABLE faqs (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Unique constraint to prevent ordering collisions
CREATE UNIQUE INDEX faqs_community_sort_order_unique
  ON faqs (community_id, sort_order) WHERE deleted_at IS NULL;
```

Standard tenant isolation: RLS policies, write-scope trigger, `community_id` FK, `deleted_at` soft delete.

### New Columns on `communities` Table

```sql
ALTER TABLE communities
  ADD COLUMN contact_name  TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT;
```

All nullable. Communities without contact info show an empty state on the contact page.

### Single Migration

One migration file covering both the `faqs` table creation and the `communities` column additions. Check the current highest migration number before creating.

### Default FAQ Constants

Stored in `packages/shared/src/constants/default-faqs.ts` as a typed constant array:

```typescript
export const DEFAULT_FAQS: { question: string; answer: string }[] = [
  {
    question: "How do I submit a maintenance request?",
    answer: "From the home screen, tap the Maintenance card. Then tap \"Submit Request\" at the top. Fill in the details, attach any photos, and submit. You'll receive updates as your request is processed."
  },
  {
    question: "How do I view community documents?",
    answer: "Tap the Documents card on the home screen. You can browse by category or use the search bar to find specific documents. Tap any document to view or download it."
  },
  {
    question: "How do I view upcoming meetings?",
    answer: "Tap the Meetings card on the home screen. Upcoming meetings are shown at the top with date, time, and location. Past meetings with posted minutes appear below."
  },
  {
    question: "How do I update my notification preferences?",
    answer: "Go to Profile > Edit Profile and scroll to the Email Notifications section. You can toggle announcements, meeting notices, and in-app alerts, and choose your email frequency."
  },
  {
    question: "How do I change my password?",
    answer: "Go to Profile > Security. Enter your current password, then your new password twice to confirm. If you've forgotten your current password, use the \"Forgot your password?\" link to reset via email."
  }
];
```

### Lazy-Seed Strategy

- `ensureFaqsExist(communityId)` utility function in the FAQ service layer
- Called by the `GET /api/v1/faqs` handler, but not embedded in it
- Checks if any FAQs exist for the community; if not, inserts the defaults from the constant
- Uses `ON CONFLICT DO NOTHING` to handle race conditions (two concurrent first-loads)
- Reusable — can be called during community onboarding later if needed

## API Routes

| Endpoint | Method | Purpose | Auth | Notes |
|----------|--------|---------|------|-------|
| `/api/v1/faqs` | GET | List FAQs for community | Authenticated | Calls `ensureFaqsExist()` before querying |
| `/api/v1/faqs` | POST | Create new FAQ | Admin only | Zod-validated body |
| `/api/v1/faqs/[id]` | PATCH | Update FAQ question/answer | Admin only | |
| `/api/v1/faqs/[id]` | DELETE | Soft-delete FAQ | Admin only | Sets `deleted_at` |
| `/api/v1/faqs/reorder` | PATCH | Bulk update sort_order | Admin only | Body: `{ ids: number[] }` in desired order |
| `/api/v1/community/contact` | GET | Get community contact info | Authenticated | Returns `contact_name`, `contact_email`, `contact_phone` |
| `/api/v1/community/contact` | PATCH | Update community contact info | Admin only | Zod-validated body |

All routes follow existing patterns: `withErrorHandler`, `requirePermission`, `createScopedClient`, `logAuditEvent`.

Password change uses Supabase client-side `updateUser({ password })` — no custom API route needed.

## Page Designs

### 1. Edit Profile (`/mobile/settings`)

**Layout:** Single scrolling page with stacked section groups.

**Sections (top to bottom):**
1. **Personal Information** — Name (editable), Email (read-only, managed by Supabase), Phone (editable). Stone-bordered card with inline field labels.
2. **Email Notifications** — Toggle rows for Announcements, Meeting Notices, In-App Alerts. Stone-900 toggles.
3. **Email Frequency** — Select dropdown (Immediate / Daily Digest / Weekly Digest / Never).
4. **Accessibility** — Large Text toggle (client-side localStorage via `useLargeText()` hook).
5. **SMS Notifications** — Phone verification + TCPA consent flow (reuses `SmsConsentForm` component logic, adapted to mobile styling).
6. **Save Changes** button at bottom (stone-900 primary).

**Data flow:** Server `page.tsx` fetches user profile + notification preferences + community membership. Client content component manages form state. Save hits `PATCH /api/v1/notification-preferences`.

### 2. Security (`/mobile/settings/security`)

**Layout:** Single card with three password fields + action buttons.

**Sections:**
1. **Change Password** card — Current Password, New Password, Confirm New Password fields. "Update Password" button (stone-900 primary).
2. **Forgot your password?** — Underlined link below the card. Triggers Supabase `resetPasswordForEmail()`, shows confirmation message.

**Implementation:**
- Inline change: Supabase client-side `updateUser({ password: newPassword })` after verifying current password via `signInWithPassword()`.
- Forgot flow: `resetPasswordForEmail()` sends a reset link, display success toast.
- Client-side validation: passwords match, minimum length.

### 3. Help Center (`/mobile/help`)

**Layout:** Search bar + FAQ accordion + Contact link card.

**Sections:**
1. **Search bar** — Filters FAQ list client-side. Lucide `Search` icon (never emoji). Stone-200 border, stone-400 placeholder.
2. **Frequently Asked Questions** — Accordion list. Tap question to expand/collapse answer. Chevron indicator (up/down). Answers in stone-500 text.
3. **Contact Management** card — Links to `/mobile/help/contact`. Shows title + subtitle + chevron. Separated below the FAQ list.
4. **Manage FAQs** link — Only visible to admin roles. Links to `/mobile/help/manage`.

**Data flow:** Server `page.tsx` fetches FAQs via API (triggers lazy-seed). Client content component handles accordion state + search filtering.

### 4. Contact Management (`/mobile/help/contact`)

**Layout:** Contact info card + action buttons.

**Sections:**
1. **Your Management Team** card — Three rows: Contact Name (User icon), Email (Mail icon), Phone (Phone icon). Each row has a circular icon container (stone-100 bg) + label + value. Email and phone are tappable links (`mailto:` / `tel:`).
2. **Action buttons** — Two buttons side by side: "Email" (stone-900 primary, opens mailto) and "Call" (white secondary with stone border, opens tel).
3. **Empty state** — If no contact info is set, show encouraging message: "Contact information hasn't been added yet." Admins see a link to edit it.

**Data flow:** Server `page.tsx` fetches community contact info via `GET /api/v1/community/contact`. Read-only display.

### 5. FAQ Management (`/mobile/help/manage`) — Admin Only

**Layout:** Reorderable FAQ list + add button.

**Sections:**
1. **FAQ list** — Each item shows: drag handle (GripVertical icon), truncated question text, edit button (Pencil icon). Drag-to-reorder for sort_order.
2. **Add Question** button — Dashed border, centered Plus icon + text. Opens edit sheet.
3. **Edit sheet** — Bottom sheet or inline expansion with: Question field (text input), Answer field (textarea), Delete button (red text, with confirmation). Save/Cancel actions.

**Interactions:**
- Reorder: Drag handle triggers reorder. On drop, calls `PATCH /api/v1/faqs/reorder` with new ID order.
- Edit: Pencil icon opens edit sheet. Save calls `PATCH /api/v1/faqs/[id]`.
- Add: Opens blank edit sheet. Save calls `POST /api/v1/faqs`.
- Delete: Confirmation dialog, then `DELETE /api/v1/faqs/[id]`.

**Access:** Route protected by admin role check in server `page.tsx`. Non-admins redirected.

## Wiring MobileProfileContent.tsx

Update the 4 `SettingsRow` components to include `href` props:

```tsx
<SettingsRow icon={User} label="Edit Profile" href="/mobile/settings" />
<SettingsRow icon={Lock} label="Security" href="/mobile/settings/security" isLast />
<SettingsRow icon={HelpCircle} label="Help Center" href="/mobile/help" />
<SettingsRow icon={MessageSquare} label="Contact Management" href="/mobile/help/contact" isLast />
```

## File Structure

```
apps/web/src/
├── app/mobile/
│   ├── settings/
│   │   ├── page.tsx                         # Edit Profile server page
│   │   └── security/
│   │       └── page.tsx                     # Security server page
│   ├── help/
│   │   ├── page.tsx                         # Help Center server page
│   │   ├── contact/
│   │   │   └── page.tsx                     # Contact Management server page
│   │   └── manage/
│   │       └── page.tsx                     # FAQ Management server page (admin)
├── components/mobile/
│   ├── MobileSettingsContent.tsx             # Edit Profile client component
│   ├── MobileSecurityContent.tsx             # Security client component
│   ├── MobileHelpContent.tsx                 # Help Center client component
│   ├── MobileContactContent.tsx              # Contact Management client component
│   └── MobileFaqManageContent.tsx            # FAQ Management client component
├── app/api/v1/
│   ├── faqs/
│   │   ├── route.ts                         # GET (list + lazy-seed), POST (create)
│   │   ├── [id]/
│   │   │   └── route.ts                     # PATCH (update), DELETE (soft-delete)
│   │   └── reorder/
│   │       └── route.ts                     # PATCH (bulk reorder)
│   └── community/
│       └── contact/
│           └── route.ts                     # GET, PATCH
packages/
├── db/src/schema/
│   └── faqs.ts                              # Drizzle schema for faqs table
├── db/migrations/
│   └── XXXX_add_faqs_and_contact.sql        # Migration file
└── shared/src/constants/
    └── default-faqs.ts                      # Default FAQ content constant
```

## Patterns & Conventions

- **Mobile page pattern:** Server `page.tsx` for auth/data → client `Content.tsx` for rendering
- **Motion:** `PageTransition` wrapper, `SlideUp` for staggered sections, `StaggerChildren` for lists
- **Navigation:** `MobileBackHeader` as first child of every content component
- **Styling:** Warm stone palette (stone-50 bg, stone-900 text, stone-200 borders, white cards). Lucide icons only — never emoji.
- **Touch targets:** Minimum 44px on all interactive elements
- **State handling:** Loading (skeleton), empty (encouraging message + action), error (alert banner)
- **Accessibility:** Focus-visible rings on all interactives, aria-hidden on decorative icons, aria-expanded on accordions

## Out of Scope

- Desktop versions of Help Center / FAQ Management (desktop help doesn't exist yet)
- Admin contact info editing UI (admins update via `PATCH /api/v1/community/contact` — a settings UI for this can come later)
- FAQ rich text / markdown in answers (plain text for now)
- FAQ categories or tags
- Analytics on FAQ views

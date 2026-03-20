# Mobile Settings & Help Pages — Design Spec

**Date:** 2026-03-20
**Branch:** mobile-design-polish
**Status:** Approved

## Overview

Build out the 4 "Coming soon" rows on the mobile Profile page (`/mobile/more`) into fully functional routes: Edit Profile, Security, Help Center, and Management Contact. Add an admin-only FAQ management page. Wire all routes into the existing `MobileProfileContent.tsx`.

## Routes

| Route | Purpose | Auth |
|-------|---------|------|
| `/mobile/settings` | Edit Profile — personal info + notifications + accessibility + SMS consent | Authenticated |
| `/mobile/settings/security` | Security — inline password change + forgot password link | Authenticated |
| `/mobile/help` | Help Center — FAQ accordion with search | Authenticated |
| `/mobile/help/contact` | Management Contact — community contact info display | Authenticated |
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

-- Index for community lookup
CREATE INDEX idx_faqs_community ON faqs(community_id) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs FORCE ROW LEVEL SECURITY;

CREATE POLICY faqs_service_bypass ON faqs
  FOR ALL
  USING (pp_rls_is_privileged());

CREATE POLICY faqs_community_read ON faqs
  FOR SELECT
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_insert ON faqs
  FOR INSERT
  WITH CHECK (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_update ON faqs
  FOR UPDATE
  USING (pp_rls_can_access_community(community_id));

CREATE POLICY faqs_community_delete ON faqs
  FOR DELETE
  USING (pp_rls_can_access_community(community_id));

-- Tenant scope trigger (blocks unscoped mutations)
CREATE TRIGGER faqs_tenant_scope
  BEFORE INSERT OR UPDATE ON faqs
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();
```

RLS policies follow the same pattern as `move_checklists` (migration `0106`). Note: RLS handles row-level access; application-level admin checks (via `membership.isAdmin`) handle write authorization.

### New Columns on `communities` Table

```sql
ALTER TABLE communities
  ADD COLUMN contact_name  TEXT,
  ADD COLUMN contact_email TEXT,
  ADD COLUMN contact_phone TEXT;
```

All nullable. Communities without contact info show an empty state on the contact page.

**Drizzle schema update required:** Add `contactName`, `contactEmail`, `contactPhone` columns to `packages/db/src/schema/communities.ts` so the ORM can select/update these fields via `createScopedClient`.

### Drizzle Schema: `packages/db/src/schema/faqs.ts`

```typescript
import { pgTable, bigserial, bigint, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const faqs = pgTable('faqs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

**Note:** No `updated_at` trigger exists in this codebase. The application layer must explicitly set `updatedAt` in all PATCH handlers (consistent with every other table in the project).

### Migration

**File:** `0108_add_faqs_and_community_contact.sql` (next after current highest `0107_esign_native_template_support.sql`).

Single migration covering both the `faqs` table creation (with full RLS, triggers, indexes) and the `communities` column additions. Must also add a corresponding entry to `packages/db/migrations/meta/_journal.json` with `"idx": 108` and `"tag": "0108_add_faqs_and_community_contact"`.

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

- `ensureFaqsExist(communityId)` — standalone utility in `apps/web/src/lib/services/faq-service.ts`
- Called by the `GET /api/v1/faqs` handler, but not embedded in it — keeps the read path clean and makes it reusable for community onboarding later
- Checks for any **active** FAQs (`WHERE deleted_at IS NULL`) for the community; if count is 0, inserts the defaults
- Uses `ON CONFLICT DO NOTHING` on the `(community_id, sort_order)` unique index to handle race conditions
- **Intentional behavior:** If an admin deletes all FAQs, the lazy-seed will re-insert defaults on next page load. This is the desired behavior — admins who want a truly empty FAQ page should edit the defaults rather than delete them all. This keeps the Help Center always populated.

## API Routes

| Endpoint | Method | Purpose | Auth | Notes |
|----------|--------|---------|------|-------|
| `/api/v1/faqs` | GET | List FAQs for community | Authenticated | Calls `ensureFaqsExist()` before querying |
| `/api/v1/faqs` | POST | Create new FAQ | Admin only (`membership.isAdmin`) | Zod-validated body |
| `/api/v1/faqs/[id]` | PATCH | Update FAQ question/answer | Admin only (`membership.isAdmin`) | Sets `updated_at` explicitly |
| `/api/v1/faqs/[id]` | DELETE | Soft-delete FAQ | Admin only (`membership.isAdmin`) | Sets `deleted_at` |
| `/api/v1/faqs/reorder` | PATCH | Bulk update sort_order | Admin only (`membership.isAdmin`) | Body: `{ ids: number[] }` in desired order |
| `/api/v1/community/contact` | GET | Get community contact info | Authenticated | Returns `contact_name`, `contact_email`, `contact_phone` |
| `/api/v1/community/contact` | PATCH | Update community contact info | Admin only (`membership.isAdmin`) | Zod-validated body |

### Authorization Approach

FAQ and contact routes use `membership.isAdmin` for write authorization (same pattern as Community Settings on desktop). No new RBAC resource needed — FAQs are a community configuration concern, not a separate permission domain. Read access is available to all authenticated community members via standard RLS.

All routes follow existing patterns: `withErrorHandler`, `requirePermission('settings', action)` for the contact endpoint (since it modifies community settings), and `membership.isAdmin` guard for FAQ mutations. All use `createScopedClient`, `logAuditEvent`.

### Audit Event Names

| Event | Route |
|-------|-------|
| `faq.created` | POST `/api/v1/faqs` |
| `faq.updated` | PATCH `/api/v1/faqs/[id]` |
| `faq.deleted` | DELETE `/api/v1/faqs/[id]` |
| `faq.reordered` | PATCH `/api/v1/faqs/reorder` |
| `community.contact_updated` | PATCH `/api/v1/community/contact` |

### Reorder Validation

The `PATCH /api/v1/faqs/reorder` handler must:
1. Validate all IDs in the array belong to the requesting user's community
2. Validate none of the IDs are soft-deleted
3. Reject duplicate IDs
4. Assign `sort_order` based on array position (index 0 → sort_order 0, etc.)

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
- Inline change: Verify current password by calling Supabase `signInWithPassword()` first, then `updateUser({ password: newPassword })`. Note: `signInWithPassword()` creates a new session, which is acceptable — the user remains logged in and the session simply refreshes.
- Forgot flow: `resetPasswordForEmail()` sends a reset link, display success toast.
- Client-side validation: passwords match, minimum 8 characters (Supabase default).

### 3. Help Center (`/mobile/help`)

**Layout:** Search bar + FAQ accordion + Contact link card.

**Sections:**
1. **Search bar** — Filters FAQ list client-side. Lucide `Search` icon (never emoji). Stone-200 border, stone-400 placeholder.
2. **Frequently Asked Questions** — Accordion list. Tap question to expand/collapse answer. Chevron indicator (up/down). Answers in stone-500 text.
3. **Management Contact** card — Links to `/mobile/help/contact`. Shows title + subtitle + chevron. Separated below the FAQ list.
4. **Manage FAQs** link — Only visible to admin roles. Links to `/mobile/help/manage`.

**Data flow:** Server `page.tsx` fetches FAQs via API (triggers lazy-seed) and passes `isAdmin` flag. Client content component handles accordion state + search filtering.

### 4. Management Contact (`/mobile/help/contact`)

**Layout:** Contact info card + action buttons.

**Sections:**
1. **Your Management Team** card — Three rows: Contact Name (User icon), Email (Mail icon), Phone (Phone icon). Each row has a circular icon container (stone-100 bg) + label + value. Email and phone are tappable links (`mailto:` / `tel:`).
2. **Action buttons** — Two buttons side by side: "Email" (stone-900 primary, opens mailto) and "Call" (white secondary with stone border, opens tel).
3. **Empty state** — If no contact info is set, show encouraging message: "Contact information hasn't been added yet." Admins see a link to update it.

**Data flow:** Server `page.tsx` fetches community contact info via `GET /api/v1/community/contact`. Read-only display.

### 5. FAQ Management (`/mobile/help/manage`) — Admin Only

**Layout:** Reorderable FAQ list + add button.

**Sections:**
1. **FAQ list** — Each item shows: up/down arrow buttons for reorder, truncated question text, edit button (Pencil icon). Arrow buttons are more accessible on mobile than drag-to-reorder and avoid scroll conflicts.
2. **Add Question** button — Dashed border, centered Plus icon + text. Opens edit sheet.
3. **Edit sheet** — Bottom sheet with: Question field (text input), Answer field (textarea), Delete button (red text, with confirmation). Save/Cancel actions.

**Interactions:**
- Reorder: Up/down arrow buttons swap adjacent items. On change, calls `PATCH /api/v1/faqs/reorder` with new ID order.
- Edit: Pencil icon opens edit sheet. Save calls `PATCH /api/v1/faqs/[id]`.
- Add: Opens blank edit sheet. Save calls `POST /api/v1/faqs`.
- Delete: Confirmation dialog, then `DELETE /api/v1/faqs/[id]`.

**Access:** Route protected by admin role check in server `page.tsx`. Non-admins redirected to `/mobile/help`.

**Accessibility:** Arrow buttons have descriptive `aria-label` ("Move up", "Move down"). First item disables "Move up", last item disables "Move down". ARIA live region announces reorder result.

## Wiring MobileProfileContent.tsx

Update the 4 `SettingsRow` components to include `href` props:

```tsx
<SettingsRow icon={User} label="Edit Profile" href="/mobile/settings" />
<SettingsRow icon={Lock} label="Security" href="/mobile/settings/security" isLast />
<SettingsRow icon={HelpCircle} label="Help Center" href="/mobile/help" />
<SettingsRow icon={MessageSquare} label="Management Contact" href="/mobile/help/contact" isLast />
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
│   │   │   └── page.tsx                     # Management Contact server page
│   │   └── manage/
│   │       └── page.tsx                     # FAQ Management server page (admin)
├── components/mobile/
│   ├── MobileSettingsContent.tsx             # Edit Profile client component
│   ├── MobileSecurityContent.tsx             # Security client component
│   ├── MobileHelpContent.tsx                 # Help Center client component
│   ├── MobileContactContent.tsx              # Management Contact client component
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
├── lib/services/
│   └── faq-service.ts                       # ensureFaqsExist() utility
packages/
├── db/src/schema/
│   ├── faqs.ts                              # Drizzle schema for faqs table
│   └── communities.ts                       # Add contactName, contactEmail, contactPhone
├── db/migrations/
│   └── 0108_add_faqs_and_community_contact.sql  # Migration file
│   └── meta/_journal.json                   # Add entry at index 108
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
- **Accessibility:** Focus-visible rings on all interactives, aria-hidden on decorative icons, aria-expanded on accordions, ARIA live regions for dynamic content changes

## Out of Scope

- Desktop versions of Help Center / FAQ Management (desktop help doesn't exist yet)
- Admin contact info editing UI on mobile (admins update via `PATCH /api/v1/community/contact` — a dedicated settings UI can come later)
- FAQ rich text / markdown in answers (plain text for now)
- FAQ categories or tags
- Analytics on FAQ views
- FAQ count limits (at current scale, client-side search over the full list is fine)

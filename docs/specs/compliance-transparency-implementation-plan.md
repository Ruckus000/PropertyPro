# Compliance Transparency Page — Implementation Plan

**Date:** March 7, 2026
**Companion spec:** `docs/specs/compliance-transparency-page-spec.md`
**Companion legal analysis:** `docs/compliance-badge-research-2026-03.md`
**Target:** 7 discrete Codex tasks, each self-contained with clear inputs/outputs

---

## Architecture Overview

```
packages/shared/src/compliance/templates.ts    ← Expand templates (3 → 16 items)
packages/shared/src/features/types.ts          ← Add hasTransparencyPage flag
packages/shared/src/features/community-features.ts ← Set flag per community type
packages/db/src/schema/communities.ts          ← Add transparency_enabled column
packages/db/src/schema/compliance-checklist-items.ts ← Add is_conditional column
packages/db/migrations/XXXX_transparency.sql   ← Migration

apps/web/src/lib/services/transparency-service.ts  ← Data aggregation service
apps/web/src/app/api/v1/transparency/route.ts      ← Public GET endpoint

apps/web/src/components/transparency/              ← All UI components
apps/web/src/app/(public)/[subdomain]/transparency/page.tsx  ← Public route
apps/web/src/app/(authenticated)/settings/transparency/page.tsx ← Toggle page

scripts/seed-demo.ts                               ← Seed transparency data
```

---

## Task 1: Database Migration & Schema Changes

**Goal:** Add `transparency_enabled` to communities, `is_conditional` to compliance checklist items, and run migration.

### Files to modify:

**`packages/db/src/schema/communities.ts`** — Add after the `sitePublishedAt` field:

```typescript
/** Compliance Transparency Page: opt-in flag. When true, the public
 *  transparency page at /[subdomain]/transparency is accessible. */
transparencyEnabled: boolean('transparency_enabled').notNull().default(false),
/** Timestamp when an admin first acknowledged the transparency page
 *  scope limitations. Required before transparencyEnabled can be set true. */
transparencyAcknowledgedAt: timestamp('transparency_acknowledged_at', { withTimezone: true }),
```

**`packages/db/src/schema/compliance-checklist-items.ts`** — Add after the `rollingWindow` field:

```typescript
/** True for items that may not apply to every association (e.g., video recordings,
 *  conflict-of-interest contracts). Displayed as "Not required" on transparency page
 *  when no document is linked, rather than "Not yet posted". */
isConditional: boolean('is_conditional').notNull().default(false),
```

**`packages/db/migrations/XXXX_add_transparency_columns.sql`** — New migration:

```sql
-- Add transparency opt-in columns to communities
ALTER TABLE communities
  ADD COLUMN transparency_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN transparency_acknowledged_at TIMESTAMPTZ;

-- Add conditional flag to compliance checklist items
ALTER TABLE compliance_checklist_items
  ADD COLUMN is_conditional BOOLEAN NOT NULL DEFAULT false;
```

### Verification:
- `pnpm --filter @propertypro/db db:migrate` succeeds
- `pnpm typecheck` passes
- Existing compliance dashboard still renders (no breaking changes)

---

## Task 2: Expand Compliance Templates (3 → 16 Items for §718, 3 → ~10 for §720)

**Goal:** Add all statutory document requirements to the template arrays so the compliance system tracks the full §718.111(12)(g) checklist.

### Files to modify:

**`packages/shared/src/compliance/templates.ts`**

Add `isConditional?: boolean` to the `ComplianceTemplateItem` interface:

```typescript
export interface ComplianceTemplateItem {
  templateKey: string;
  title: string;
  description: string;
  category: 'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations';
  statuteReference: string;
  deadlineDays?: number;
  rollingMonths?: number;
  isConditional?: boolean;  // NEW
}
```

Replace `CONDO_718_CHECKLIST_TEMPLATE` with the full 16-item array. Keep the 3 existing items (same `templateKey` values) so existing data is preserved. Add the 13 new items:

```typescript
export const CONDO_718_CHECKLIST_TEMPLATE: readonly ComplianceTemplateItem[] = [
  // === GOVERNING DOCUMENTS ===
  {
    templateKey: '718_declaration',
    title: 'Declaration of Condominium & Amendments',
    description: 'Recorded declaration and all amendments must be posted in the owner portal.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(a)',
  },
  {
    templateKey: '718_bylaws',  // EXISTING — key unchanged
    title: 'Bylaws & Amendments',
    description: 'Current bylaws and all amendments must be posted and available to residents.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(b)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_articles',
    title: 'Articles of Incorporation & Amendments',
    description: 'Articles of Incorporation filed with the Department of State and all amendments.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(c)',
  },
  {
    templateKey: '718_rules',
    title: 'Rules & Regulations',
    description: 'Current rules and regulations adopted by the board.',
    category: 'governing_documents',
    statuteReference: '§718.111(12)(g)(2)(d)',
  },
  {
    templateKey: '718_qa_sheet',
    title: 'Question & Answer Sheet',
    description: 'Frequently asked questions sheet required by §718.504.',
    category: 'governing_documents',
    statuteReference: '§718.504',
  },

  // === FINANCIAL RECORDS ===
  {
    templateKey: '718_budget',  // EXISTING — key unchanged
    title: 'Annual Budget',
    description: 'Annual budget and any proposed budget for the upcoming fiscal year.',
    category: 'financial_records',
    statuteReference: '§718.112(2)(f)',
    deadlineDays: 30,
  },
  {
    templateKey: '718_financial_report',
    title: 'Annual Financial Report',
    description: 'Annual financial report or financial statement for the preceding fiscal year.',
    category: 'financial_records',
    statuteReference: '§718.111(13)',
    deadlineDays: 30,
  },

  // === MEETING RECORDS ===
  {
    templateKey: '718_minutes_rolling_12m',  // EXISTING — key unchanged
    title: 'Approved Meeting Minutes (Rolling 12 Months)',
    description: 'Board and owner meeting minutes must remain available on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(e)',
    rollingMonths: 12,
  },
  {
    templateKey: '718_video_recordings',
    title: 'Video Recordings of Virtual Meetings',
    description: 'Recordings of meetings conducted via virtual conferencing, retained on a rolling 12-month basis.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(f)',
    rollingMonths: 12,
    isConditional: true,  // Only applies if the association held virtual meetings
  },
  {
    templateKey: '718_affidavits',
    title: 'Affidavits Required by Chapter 718',
    description: 'All affidavits required to be executed by officers or directors under Chapter 718.',
    category: 'meeting_records',
    statuteReference: '§718.111(12)(g)(2)(g)',
    isConditional: true,
  },

  // === INSURANCE ===
  {
    templateKey: '718_insurance',
    title: 'Current Insurance Policies',
    description: 'All current insurance policies maintained by the association.',
    category: 'insurance',
    statuteReference: '§718.111(11)',
  },

  // === OPERATIONS ===
  {
    templateKey: '718_contracts',
    title: 'List of Executory Contracts',
    description: 'All contracts and documents to which the association is a party or under which the association has obligations.',
    category: 'operations',
    statuteReference: '§718.111(12)(g)(2)',
  },
  {
    templateKey: '718_conflict_contracts',
    title: 'Conflict of Interest Contracts',
    description: 'Contracts or transactions with a director, officer, corporation, or firm in which a director or officer has a financial interest.',
    category: 'operations',
    statuteReference: '§718.3026',
    isConditional: true,
  },
  {
    templateKey: '718_bids',
    title: 'Bids Received (After Bidding Closes)',
    description: 'All bids received by the association for work, services, or materials, available after bidding is closed.',
    category: 'operations',
    statuteReference: '§718.111(12)(g)(2)',
    rollingMonths: 12,
    isConditional: true,
  },
  {
    templateKey: '718_inspection_reports',
    title: 'Structural / Milestone Inspection Reports',
    description: 'Milestone inspection reports required under §553.899 and the Condominium Act.',
    category: 'operations',
    statuteReference: '§553.899',
    isConditional: true,  // Only for buildings 3+ stories, 25+ years old
  },
  {
    templateKey: '718_sirs',
    title: 'Structural Integrity Reserve Study (SIRS)',
    description: 'Structural integrity reserve study as required by §718.112(2)(g).',
    category: 'operations',
    statuteReference: '§718.112(2)(g)',
    isConditional: true,
  },
] as const;
```

Similarly expand `HOA_720_CHECKLIST_TEMPLATE` for §720 requirements (governing docs, financial records, meeting records, insurance, operations — approximately 10 items based on §720.303(4)).

### POST /api/v1/compliance Behavior:

The existing endpoint is **idempotent** — it checks `templateKey` uniqueness before inserting. New template items will be inserted on next POST call. Existing items with matching `templateKey` are left untouched. No data loss.

**However:** We need to ensure the POST endpoint also sets `is_conditional` from the template. Modify the insertion mapping in `apps/web/src/app/api/v1/compliance/route.ts`:

```typescript
// In the POST handler, when inserting template items:
isConditional: templateItem.isConditional ?? false,
```

### Verification:
- `pnpm typecheck` passes
- Existing 3 items per community are unchanged (same templateKey values)
- POST /api/v1/compliance for a community creates 16 items (condo) or ~10 items (HOA)
- Existing compliance dashboard renders correctly with expanded items
- `pnpm lint` passes

---

## Task 3: Add Feature Flag & Community Feature Wiring

**Goal:** Add `hasTransparencyPage` feature flag so the transparency page can be gated per community type.

### Files to modify:

**`packages/shared/src/features/types.ts`** — Add to `CommunityFeatures`:

```typescript
/** Public compliance transparency page (condo/HOA only) */
readonly hasTransparencyPage: boolean;
```

**`packages/shared/src/features/community-features.ts`** — Set per type:

```typescript
condo_718: {
  // ... existing flags ...
  hasTransparencyPage: true,
},
hoa_720: {
  // ... existing flags ...
  hasTransparencyPage: true,
},
apartment: {
  // ... existing flags ...
  hasTransparencyPage: false,
},
```

### Verification:
- `pnpm typecheck` passes (exhaustive satisfies constraint catches all types)
- No runtime changes until UI/API tasks consume the flag

---

## Task 4: Transparency Data Service

**Goal:** Create a service that aggregates all data needed for the transparency page from existing tables. Both the server-rendered page and the API endpoint will use this single service.

### New file: `apps/web/src/lib/services/transparency-service.ts`

```typescript
import { createScopedClient } from '@propertypro/db';
import { complianceChecklistItems } from '@propertypro/db/schema';
import { meetings } from '@propertypro/db/schema';
import { documents } from '@propertypro/db/schema';
import { communities } from '@propertypro/db/schema';
import { eq, and, gte, isNull } from '@propertypro/db/filters';
import { calculateComplianceStatus } from '../utils/compliance-calculator';
import { getNoticeLeadDays } from '../utils/meeting-calculator';
import { COMMUNITY_FEATURES } from '@propertypro/shared/features';

// --- Types (export for use in components) ---

export interface TransparencyDocumentItem {
  title: string;
  statuteReference: string;
  status: 'posted' | 'not_posted' | 'not_required';
  postedAt: string | null;       // ISO 8601
  isConditional: boolean;
}

export interface TransparencyDocumentGroup {
  category: string;
  label: string;                  // Human-readable: "Governing Documents"
  items: TransparencyDocumentItem[];
}

export interface TransparencyMeetingNotice {
  title: string;
  meetingType: string;
  startsAt: string;               // ISO 8601
  noticePostedAt: string | null;
  leadTimeHours: number | null;
  requiredLeadTimeHours: number;
  metRequirement: boolean | null;
}

export interface TransparencyMinutesMonth {
  month: string;                  // "2026-01"
  label: string;                  // "Jan '26"
  hasMinutes: boolean;
}

export interface TransparencyPageData {
  community: {
    name: string;
    communityType: string;
    city: string | null;
    state: string | null;
    logoPath: string | null;
  };
  documents: TransparencyDocumentGroup[];
  meetingNotices: {
    meetings: TransparencyMeetingNotice[];
    ownerNoticeDays: number;
    boardNoticeHours: number;
  };
  minutesAvailability: {
    months: TransparencyMinutesMonth[];
    totalMonths: number;
    monthsWithMinutes: number;
  };
  portalStatus: {
    passwordProtected: boolean;
    individualCredentials: boolean;
    publicNoticesPage: boolean;
  };
  metadata: {
    generatedAt: string;
    dataSource: 'PropertyPro Platform';
  };
}
```

**Key implementation details:**

1. **Document groups:** Query `compliance_checklist_items` for the community. Group by `category`. For each item:
   - If `documentId !== null` → status `'posted'`, use `documentPostedAt`
   - If `documentId === null && isConditional` → status `'not_required'`
   - If `documentId === null && !isConditional` → status `'not_posted'`

2. **Meeting notices:** Query `meetings` for the last 12 months. For each meeting:
   - Calculate `leadTimeHours = startsAt - noticePostedAt` (in hours)
   - Calculate `requiredLeadTimeHours` via existing `getNoticeLeadDays()` × 24
   - `metRequirement = leadTimeHours >= requiredLeadTimeHours`
   - If `noticePostedAt` is null → `leadTimeHours = null`, `metRequirement = null`

3. **Minutes availability:** For each of the last 12 months, check if any document in the "meeting minutes" category has a `createdAt` within that month.

4. **Portal status:** These are architectural facts, derived from feature flags:
   - `passwordProtected: true` (always — platform design)
   - `individualCredentials: true` (always — Supabase Auth)
   - `publicNoticesPage: features.hasPublicNoticesPage`

### Verification:
- Unit test: given known checklist items + meetings, assert correct output shape
- Integration test: run against seeded demo data, verify all fields populated
- `pnpm typecheck` passes

---

## Task 5: Public API Endpoint

**Goal:** Create `GET /api/v1/transparency?communityId={id}` — a public, unauthenticated endpoint with rate limiting.

### New file: `apps/web/src/app/api/v1/transparency/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { findCommunityById } from '@propertypro/db/queries';
import { COMMUNITY_FEATURES } from '@propertypro/shared/features';

export async function GET(req: NextRequest) {
  // 1. Parse communityId from query string
  const communityId = Number(req.nextUrl.searchParams.get('communityId'));
  if (!communityId || isNaN(communityId)) {
    return NextResponse.json({ error: 'Missing or invalid communityId' }, { status: 400 });
  }

  // 2. Look up community (unscoped — communities table is root entity)
  const community = await findCommunityById(communityId);
  if (!community) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 3. Check feature flag + opt-in
  const features = COMMUNITY_FEATURES[community.communityType];
  if (!features.hasTransparencyPage || !community.transparencyEnabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 4. Aggregate data
  const data = await getTransparencyPageData(community);

  // 5. Return with cache headers (1 hour public cache)
  return NextResponse.json({ data }, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
```

**Rate limiting:** The existing middleware at `apps/web/src/middleware.ts` already applies rate limiting to `/api/v1/*` routes. Verify that the default limit (likely 60/min per IP) applies. If the transparency route needs a different limit, add a route-specific override in the middleware config.

**Authentication:** This route does NOT call `requireAuthenticatedUserId()`. It's intentionally public. The middleware should be configured to skip auth for `/api/v1/transparency` (add to the token-authenticated/public route allowlist alongside `/api/v1/invitations`, `/api/v1/auth/signup`, etc.).

### Verification:
- `curl /api/v1/transparency?communityId=1` returns data for opted-in communities
- `curl /api/v1/transparency?communityId=999` returns 404
- Apartment community returns 404
- Non-opted-in community returns 404
- Response includes `Cache-Control` header
- No auth header required

---

## Task 6: Transparency Page UI Components & Public Route

**Goal:** Build all UI components and the public-facing server-rendered page.

### New files:

**`apps/web/src/app/(public)/[subdomain]/transparency/page.tsx`** — Server component:

```typescript
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';
import { COMMUNITY_FEATURES } from '@propertypro/shared/features';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { TransparencyPage } from '@/components/transparency/transparency-page';

interface Props {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicTransparencyPage({ params, searchParams }: Props) {
  const [{ subdomain }, resolvedSearchParams, requestHeaders] = await Promise.all([
    params, searchParams, headers(),
  ]);

  const community = await resolvePublicCommunity(
    resolvedSearchParams, subdomain, requestHeaders.get('host'),
  );

  if (!community) notFound();

  const features = COMMUNITY_FEATURES[community.communityType];
  if (!features.hasTransparencyPage) notFound();

  // Check opt-in (need full community record with transparencyEnabled)
  // ... fetch full community, check transparencyEnabled ...

  const data = await getTransparencyPageData(community);

  return <TransparencyPage data={data} />;
}

export const metadata = {
  title: 'Compliance Transparency',
  description: 'Public compliance transparency page showing document posting and meeting notice status.',
};
```

**`apps/web/src/components/transparency/transparency-page.tsx`** — Main layout:

Follow the existing public page pattern from `public-home.tsx`:
- `<main className="mx-auto max-w-5xl px-6 py-12">`
- Community header with logo, name, type badge, city/state
- Scope notice section (above the fold)
- Document checklist grouped by category
- Meeting notice history table
- Minutes availability grid (12-month)
- Portal status section
- Footer with metadata and PropertyPro attribution

**`apps/web/src/components/transparency/scope-notice.tsx`**

A bordered card (using `<Card>` from `@propertypro/ui`) with:
- Gray-50 background (`bg-gray-50`)
- Text explaining what the page covers and doesn't cover
- Collapsible "What this page does NOT cover" section
- Uses `text-sm text-gray-700` for body, `text-xs font-semibold uppercase tracking-wide text-gray-500` for labels

**`apps/web/src/components/transparency/document-checklist-section.tsx`**

For each category group, render a section with:
- Category heading (`text-base font-semibold text-gray-900`)
- List of items, each showing:
  - Title
  - Status indicator: green dot + "Posted" / red dot + "Not yet posted" / gray dot + "Not required"
  - Posted date if available (`text-xs text-gray-500`)
  - Statute reference (`text-xs text-gray-400`)
- Use existing `StatusBadge` from `@propertypro/ui` for status indicators
- Follow design law: **never color-only** — always pair dot with text label

**`apps/web/src/components/transparency/meeting-notice-table.tsx`**

HTML table (not a library component — keep it simple):
- Columns: Meeting, Type, Notice Posted, Lead Time, Status
- Lead time shows days/hours with the statutory minimum in parentheses
- Green/red dot + text for met/missed requirement
- Footer text explaining statutory minimums
- Responsive: stack to cards on mobile (`hidden sm:table` / `sm:hidden` pattern)

**`apps/web/src/components/transparency/minutes-availability-grid.tsx`**

A 12-cell horizontal grid showing each month:
- Filled square (green-100 bg, green-700 border) for months with minutes
- Empty square (gray-100 bg, gray-300 border) for months without
- Month label below each cell (`text-xs text-gray-500`)
- Summary line: "10 of 12 months have posted minutes"
- Responsive: wrap to 2 rows of 6 on narrow screens

**`apps/web/src/components/transparency/portal-status-section.tsx`**

Simple list of 3 items with green check or gray dash:
- Password-protected portal: Active ✓
- Individual owner credentials: Supported ✓
- Public notices page: Active ✓ / Not applicable —

**`apps/web/src/components/transparency/transparency-footer.tsx`**

Metadata section:
- Data source, generated timestamp, community type
- "What this page tracks" / "What this page does NOT track" lists
- PropertyPro attribution link with UTM parameters
- `text-xs text-gray-500` for all footer text

### Design system compliance checklist:
- [ ] All spacing from token scale (no ad-hoc px values)
- [ ] Borders primary, shadows only from elevation scale
- [ ] Base font 16px; xs/sm only for metadata
- [ ] Status indicators: color + icon + text (never color-only)
- [ ] Touch targets 44px mobile, 36px desktop
- [ ] `focus-visible` ring on all interactive elements
- [ ] Respects `prefers-reduced-motion`
- [ ] WCAG 2.1 AA contrast ratios
- [ ] Mobile-responsive (tested at 375px, 768px, 1024px+)

### Verification:
- Page renders at `http://localhost:3000/sunset-condos/transparency`
- 404 for apartment communities
- 404 for non-opted-in communities
- All sections display correct data
- Mobile layout works at 375px width
- Accessibility: keyboard navigation works, screen reader reads status correctly
- `pnpm lint` passes
- `pnpm typecheck` passes

---

## Task 7: Settings Page (Transparency Toggle)

**Goal:** Create the settings page where board members/CAM can enable/disable the transparency page.

### New files:

**`apps/web/src/app/(authenticated)/settings/transparency/page.tsx`** — Server component:

Follow the existing settings page pattern:
- Resolve community context from headers
- Require authentication + community membership
- Require admin role (board_member, board_president, cam, property_manager_admin)
- Render the toggle form component

**`apps/web/src/components/transparency/transparency-toggle.tsx`** — Client component:

```typescript
"use client";
// Pattern: useState + useEffect for fetch, form for save
// Matches existing NotificationPreferencesForm pattern

// State:
// - enabled: boolean
// - acknowledged: boolean (has the admin acknowledged scope limitations?)
// - loading: boolean
// - saving: boolean

// On mount: GET /api/v1/transparency/settings?communityId={id}
// On submit: PATCH /api/v1/transparency/settings with { enabled, acknowledgedAt }
```

UI elements:
1. **Heading:** "Compliance Transparency Page" with subtitle explaining what it does
2. **Preview link:** "Preview what your transparency page will look like" → opens in new tab
3. **Acknowledgment checkbox** (required before first enable):
   - "I understand that this page displays factual data about document posting and meeting notices tracked within PropertyPro. It does not constitute a legal certification or audit of compliance. All tracked items will be visible publicly — individual items cannot be hidden."
4. **Toggle switch:** Enable/disable the transparency page
5. **URL display:** Shows the public URL when enabled (`[subdomain].getpropertypro.com/transparency`)
6. **Status indicator:** "Page is live" (green) / "Page is disabled" (gray)

### New API route: `apps/web/src/app/api/v1/transparency/settings/route.ts`

- **GET:** Returns `{ enabled: boolean, acknowledgedAt: string | null }`
- **PATCH:** Updates `transparency_enabled` and `transparency_acknowledged_at`
- Requires authentication + admin role
- Logs to `compliance_audit_log` with action `'settings_changed'`, resource type `'transparency'`

### Verification:
- Settings page renders at `/settings/transparency`
- Toggle requires acknowledgment checkbox before first enable
- PATCH updates community record
- Audit log entry created
- Public transparency page becomes accessible after enable
- Public transparency page returns 404 after disable
- Non-admin roles cannot access the settings page

---

## Task 8: Seed Demo Data

**Goal:** Update `scripts/seed-demo.ts` to populate expanded compliance checklist items and enable transparency for demo communities.

### Changes to `scripts/seed-demo.ts`:

1. After creating demo communities, call POST `/api/v1/compliance` to generate the expanded 16-item checklist for each condo/HOA demo community.

2. For each demo community, link documents to compliance checklist items:
   - Sunset Condos: 14 of 16 items satisfied (2 conditional items marked not required)
   - Palm Shores HOA: 8 of 10 items satisfied (1 not posted, 1 conditional)
   - Sunset Ridge Apartments: no compliance items (apartment type)

3. Set `transparency_enabled = true` and `transparency_acknowledged_at = NOW()` for Sunset Condos and Palm Shores HOA.

4. Ensure demo meetings have `notice_posted_at` values that demonstrate both met and missed notice deadlines:
   - At least one meeting with notice posted 21 days before (exceeds 14-day requirement)
   - At least one meeting with notice posted 10 days before (misses 14-day requirement)
   - At least one board meeting with notice posted 52 hours before (meets 48-hour requirement)

### Verification:
- `pnpm seed:demo` succeeds
- `pnpm seed:verify` passes
- Transparency page for Sunset Condos shows realistic mixed data (some items posted, some missing, some conditional)
- Transparency page for Palm Shores HOA shows similar realistic data
- Sunset Ridge Apartments returns 404

---

## Task Dependency Graph

```
Task 1 (Migration)
  │
  ├──→ Task 2 (Templates) ──→ Task 4 (Service) ──→ Task 5 (API) ──┐
  │                                      │                          │
  └──→ Task 3 (Feature Flag) ────────────┘                          │
                                                                    │
                                         Task 6 (UI) ←─────────────┘
                                            │
                                         Task 7 (Settings)
                                            │
                                         Task 8 (Seed Data)
```

**Parallelizable:**
- Tasks 1, 2, 3 can all be worked on simultaneously (no runtime dependencies between them — they touch different files)
- Tasks 4 and 5 depend on 1+2+3 being merged
- Task 6 depends on 4+5
- Task 7 depends on 6 (uses same components)
- Task 8 depends on all prior tasks

---

## Codex Task Prompts

Each task below is designed to be copy-pasted into Codex as a self-contained prompt.

### Codex Task 1 Prompt:
```
Add two new columns to the PropertyPro database schema.

1. In packages/db/src/schema/communities.ts, add after sitePublishedAt:
   - transparencyEnabled: boolean, NOT NULL, default false
   - transparencyAcknowledgedAt: timestamp with timezone, nullable

2. In packages/db/src/schema/compliance-checklist-items.ts, add after rollingWindow:
   - isConditional: boolean, NOT NULL, default false

3. Create a new migration file in packages/db/migrations/ named
   XXXX_add_transparency_columns.sql (use the next sequence number)
   with ALTER TABLE statements for both changes.

Run pnpm typecheck to verify. Do not modify any other files.
```

### Codex Task 2 Prompt:
```
Expand the compliance checklist templates in packages/shared/src/compliance/templates.ts.

1. Add isConditional?: boolean to the ComplianceTemplateItem interface.

2. Replace CONDO_718_CHECKLIST_TEMPLATE (currently 3 items) with a 16-item
   array covering all Florida §718.111(12)(g)(2) required documents. Keep
   the existing 3 templateKey values unchanged (718_bylaws, 718_budget,
   718_minutes_rolling_12m) so existing data is preserved. Add 13 new items
   for: declaration, articles_of_incorporation, rules, qa_sheet,
   financial_report, video_recordings (conditional), affidavits (conditional),
   insurance, contracts, conflict_contracts (conditional), bids (conditional),
   inspection_reports (conditional), sirs (conditional).

3. Expand HOA_720_CHECKLIST_TEMPLATE similarly for §720.303(4) requirements
   (keep existing 3 keys, add governing docs, insurance, contracts, etc.).

4. In apps/web/src/app/api/v1/compliance/route.ts, find the POST handler
   where template items are inserted. Add isConditional: templateItem.isConditional ?? false
   to the insertion mapping.

Categories: governing_documents, financial_records, meeting_records, insurance, operations.
Follow the existing code style. Run pnpm typecheck and pnpm lint to verify.
```

### Codex Task 3 Prompt:
```
Add a hasTransparencyPage feature flag to PropertyPro's community features system.

1. In packages/shared/src/features/types.ts, add to CommunityFeatures:
   readonly hasTransparencyPage: boolean;

2. In packages/shared/src/features/community-features.ts, set:
   - condo_718: hasTransparencyPage: true
   - hoa_720: hasTransparencyPage: true
   - apartment: hasTransparencyPage: false

The satisfies Record<CommunityType, CommunityFeatures> constraint will
enforce exhaustiveness. Run pnpm typecheck to verify.
```

### Codex Task 4 Prompt:
```
Create a transparency data service at apps/web/src/lib/services/transparency-service.ts.

This service aggregates data for the public compliance transparency page.
It must use createScopedClient from @propertypro/db for all tenant-scoped queries.
Use filters from @propertypro/db/filters (eq, and, gte, etc.) — never import
drizzle-orm directly (the CI guard will fail).

The service exports:
- getTransparencyPageData(community: ResolvedCommunityRecord): Promise<TransparencyPageData>
- All TypeScript interfaces for the response shape

Data aggregation logic:
1. DOCUMENTS: Query compliance_checklist_items. Group by category. Map to
   posted/not_posted/not_required based on documentId and isConditional.
2. MEETING NOTICES: Query meetings for last 12 months. Calculate lead time
   in hours between noticePostedAt and startsAt. Use getNoticeLeadDays()
   from lib/utils/meeting-calculator.ts for required lead time.
3. MINUTES AVAILABILITY: For each of last 12 months, check if any document
   in meeting_records category has documentPostedAt within that month.
4. PORTAL STATUS: Derive from COMMUNITY_FEATURES flags.

Category labels: governing_documents → "Governing Documents",
financial_records → "Financial Records", meeting_records → "Meeting Records",
insurance → "Insurance & Risk", operations → "Contracts & Operations".

Follow existing service patterns (see lib/services/compliance-alert-service.ts).
Export all interfaces. Run pnpm typecheck and pnpm lint.
```

### Codex Task 5 Prompt:
```
Create a public (unauthenticated) API endpoint at
apps/web/src/app/api/v1/transparency/route.ts.

GET /api/v1/transparency?communityId={id}

This endpoint:
1. Parses communityId from query string. Returns 400 if missing/invalid.
2. Looks up the community. Returns 404 if not found.
3. Checks COMMUNITY_FEATURES[communityType].hasTransparencyPage AND
   community.transparencyEnabled. Returns 404 if either is false.
4. Calls getTransparencyPageData() from lib/services/transparency-service.ts.
5. Returns { data: TransparencyPageData } with Cache-Control: public, max-age=3600.

This route must NOT require authentication. Add it to the public/token-auth
allowlist in apps/web/src/middleware.ts alongside /api/v1/invitations and
/api/v1/auth/signup.

Also create GET and PATCH endpoints at
apps/web/src/app/api/v1/transparency/settings/route.ts:
- GET: Requires auth. Returns { enabled, acknowledgedAt } for the community.
- PATCH: Requires auth + admin role. Updates transparency_enabled and
  transparency_acknowledged_at on the community record. Logs to
  compliance_audit_log via logAuditEvent() from @propertypro/db/utils.

Run pnpm typecheck and pnpm lint.
```

### Codex Task 6 Prompt:
```
Build the public Compliance Transparency Page UI for PropertyPro.

Create these files:
1. apps/web/src/app/(public)/[subdomain]/transparency/page.tsx
   - Server component. Use resolvePublicCommunity() for tenant resolution.
   - Check hasTransparencyPage feature flag and transparencyEnabled.
   - Call getTransparencyPageData() and render TransparencyPage component.
   - Return notFound() for invalid/disabled communities.

2. apps/web/src/components/transparency/transparency-page.tsx
   - Main layout: <main className="mx-auto max-w-5xl px-6 py-12">
   - Match existing public page structure from components/public/public-home.tsx
   - Sections: header, scope notice, documents, meeting notices, minutes grid,
     portal status, footer

3. apps/web/src/components/transparency/scope-notice.tsx
   - Above-the-fold notice explaining what the page covers/doesn't cover
   - Use Card component from @propertypro/ui with bg-gray-50
   - Collapsible "What this page does NOT cover" section

4. apps/web/src/components/transparency/document-checklist-section.tsx
   - Groups documents by category with section headers
   - Each item: title, status dot+text, posted date, statute reference
   - Use StatusBadge from @propertypro/ui for status indicators
   - Never color-only — always pair with text label

5. apps/web/src/components/transparency/meeting-notice-table.tsx
   - Table with meeting name, type, notice date, lead time, status
   - Responsive: table on desktop, stacked cards on mobile
   - Footer explaining statutory minimums

6. apps/web/src/components/transparency/minutes-availability-grid.tsx
   - 12-cell horizontal grid, each cell = one month
   - Green fill = minutes posted, gray = no minutes
   - Summary line: "X of 12 months have posted minutes"

7. apps/web/src/components/transparency/portal-status-section.tsx
   - 3 items with check/dash indicators

8. apps/web/src/components/transparency/transparency-footer.tsx
   - Metadata, scope explanation, PropertyPro attribution with UTM link

Design system rules:
- Spacing from tailwind token scale only (p-4, p-5, p-6, gap-3, gap-4, mt-10)
- Borders primary (border-gray-200), shadows secondary (e1 for hover only)
- Base font 16px; text-xs/text-sm only for metadata and statute refs
- Status: always color + icon + text. Green for posted, red for not posted,
  gray for not required/not applicable
- Touch targets 44px mobile. focus-visible ring on interactive elements.
- Mobile-responsive at 375px, 768px, 1024px breakpoints
- Use Card, Badge, StatusBadge, Button from @propertypro/ui where appropriate

Run pnpm typecheck and pnpm lint.
```

### Codex Task 7 Prompt:
```
Build the Transparency Page settings/toggle interface.

1. apps/web/src/app/(authenticated)/settings/transparency/page.tsx
   - Server component. Follow pattern from settings/page.tsx.
   - Require auth + community membership + admin role
   - Check hasTransparencyPage feature flag. Return notFound() for apartments.
   - Render TransparencyToggle client component.

2. apps/web/src/components/transparency/transparency-toggle.tsx
   - "use client" component. Follow NotificationPreferencesForm pattern.
   - State: enabled, acknowledged, loading, saving, success
   - On mount: GET /api/v1/transparency/settings?communityId={id}
   - On submit: PATCH /api/v1/transparency/settings
   - UI:
     a) Heading "Compliance Transparency Page" with descriptive subtitle
     b) Preview link that opens /[subdomain]/transparency in new tab
     c) Acknowledgment checkbox (required before first enable):
        "I understand that this page displays factual data tracked within
        PropertyPro. It does not constitute legal certification. All tracked
        items will be visible — individual items cannot be hidden."
     d) Toggle switch to enable/disable
     e) When enabled: show public URL and "Page is live" green indicator
     f) When disabled: show "Page is not publicly visible" gray indicator

   - Toggle is disabled until acknowledgment checkbox is checked
   - Use Button from @propertypro/ui for save action
   - Use Card from @propertypro/ui for the form container
   - Follow design system spacing and typography rules

Run pnpm typecheck and pnpm lint.
```

### Codex Task 8 Prompt:
```
Update scripts/seed-demo.ts to populate expanded compliance checklist items
and enable transparency for demo communities.

After communities are created:
1. For each condo/HOA community, ensure POST /api/v1/compliance is called
   (or directly insert via scoped client) to create the full 16-item (condo)
   or ~10-item (HOA) checklist from the expanded templates.

2. Link uploaded demo documents to compliance checklist items by setting
   documentId and documentPostedAt on matching checklist items:
   - Sunset Condos: satisfy 14 of 16 items (leave 2 conditional items as
     not_required). Include one not_posted non-conditional item for realism.
   - Palm Shores HOA: satisfy 8 of 10 items.

3. Set transparency_enabled = true and transparency_acknowledged_at = now
   for Sunset Condos and Palm Shores HOA.

4. Ensure demo meetings have varied notice_posted_at values:
   - At least 1 meeting with 21 days notice (exceeds 14-day rule)
   - At least 1 meeting with 10 days notice (misses 14-day rule)
   - At least 1 board meeting with 52 hours notice (meets 48-hour rule)
   - At least 1 board meeting with 36 hours notice (misses 48-hour rule)

5. Ensure meeting minutes documents exist for 10 of the last 12 months
   for Sunset Condos (to populate the minutes grid with realistic gaps).

Run pnpm seed:demo and pnpm seed:verify to validate. Run pnpm typecheck.
```

---

## Post-Implementation QA Checklist

Run after all 8 tasks are merged:

- [ ] `pnpm install` — no dependency issues
- [ ] `pnpm --filter @propertypro/db db:migrate` — migration applies cleanly
- [ ] `pnpm typecheck` — all packages pass
- [ ] `pnpm lint` — all packages pass (including db-access guard)
- [ ] `pnpm seed:demo` — seeds without errors
- [ ] `pnpm seed:verify` — passes integrity checks
- [ ] `pnpm build` — production build succeeds
- [ ] `pnpm test` — existing unit tests pass
- [ ] Manual: `http://localhost:3000/sunset-condos/transparency` renders correctly
- [ ] Manual: `http://localhost:3000/palm-shores-hoa/transparency` renders correctly
- [ ] Manual: `http://localhost:3000/sunset-ridge-apartments/transparency` returns 404
- [ ] Manual: Disable transparency in settings → page returns 404
- [ ] Manual: Re-enable → page returns data
- [ ] Manual: API endpoint returns JSON with correct cache headers
- [ ] Manual: Mobile layout at 375px — all sections readable, no horizontal scroll
- [ ] Manual: Keyboard navigation through all interactive elements
- [ ] Manual: Screen reader reads status indicators correctly
- [ ] Existing compliance dashboard at `/dashboard` still works correctly
- [ ] Existing public notices page at `/[subdomain]/notices` still works
- [ ] Existing public home page at `/[subdomain]` still works
- [ ] `pnpm perf:check` — no performance budget regressions

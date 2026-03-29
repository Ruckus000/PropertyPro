# Compliance Transparency Page — Feature Specification

**Date:** March 7, 2026
**Status:** Draft — Pending Review
**Depends on:** Phase 2 completion (Gate 3 closed), existing compliance checklist system, public routes infrastructure

---

## 1. Problem Statement

Florida condo and HOA buyers have no easy way to verify whether an association is meeting its statutory obligations for document posting and meeting notices under §718.111(12)(g) and §720.303(4). They rely on estoppel certificates (which cover financial obligations, not website compliance), attorney due diligence (expensive), or trust (unreliable).

Meanwhile, well-run associations have no way to *signal* their compliance posture to prospective buyers, realtors, or their own unit owners — even when they're doing everything right.

PropertyPro already tracks compliance data internally (checklist items, document timestamps, meeting notice lead times, audit logs). The Compliance Transparency Page makes a curated, factual subset of this data publicly visible — without making legal conclusions, issuing certifications, or creating reliance liability.

---

## 2. Competitive Landscape

| Player | What They Offer | Public-Facing? | Limitation |
|--------|----------------|----------------|------------|
| **HOACloud** | Internal compliance audit dashboard with $14K guarantee. Tracks §718/§720 requirements, document posting, meeting notices. | NO — internal only | No public transparency; the guarantee is a marketing tool, not a buyer-facing signal |
| **TransparencyHOA** | Free one-page financial analysis reports for prospective buyers. 66K+ HOAs in database. | YES — public reports | Financial health only, not statutory website compliance. Not real-time. Nonprofit, not a platform feature. |
| **Condo Control** | Document library, meeting management, communication tools | NO | No compliance tracking at all |
| **Vantaca / AppFolio / Buildium** | Full operational suites with violations, payments, accounting | NO | No Florida-specific compliance; no public transparency |
| **CONDUU / CondoSites** | Compliant website hosting | NO | Website-only; no compliance tracking or reporting |
| **Atlassian Statuspage** (cross-industry model) | Public status page with component health, 90-day uptime history, incident timeline | YES | SaaS infrastructure model, not real estate, but excellent UX patterns |
| **Vanta Trust Center** (cross-industry model) | Public security posture page with passing controls, monitoring status, gated documents | YES | B2B SaaS model, not consumer-facing, but strong "monitored not certified" framing |

**Our position:** Nobody in the Florida HOA/condo space offers a public-facing, real-time compliance transparency page. TransparencyHOA is the closest analogue but covers financials only and isn't integrated into a management platform. We would be first to market.

---

## 3. Design Principles

### 3.1 Factual, Not Evaluative

Every element on the page states a verifiable fact about data in our system. No scores, percentages, grades, ratings, or evaluative language. Examples:

- YES: "Declaration of Condominium: Posted March 1, 2026"
- YES: "Meeting minutes available for 10 of the last 12 months"
- NO: "Compliance Score: 92/100"
- NO: "This association is compliant"
- NO: "Verified by PropertyPro"

### 3.2 Honest About Gaps

If a required document is missing, the page shows that. If a meeting notice was posted late, the page shows that. The page never hides non-compliance — that would create liability and undermine trust.

- YES: "Annual Budget: Not yet posted (statutory requirement: within 30 days of adoption)"
- YES: "Board Meeting (Feb 15): Notice posted 36 hours before meeting (statutory minimum: 48 hours)"

### 3.3 Explicit About Scope

The page states clearly — above the fold, not in fine print — what it covers and what it doesn't. Inspired by Vanta's Trust Center approach of "here's what we monitor; here's what's outside our scope."

### 3.4 Live and Auto-Expiring

Data reflects the current state of the platform. If the association stops using PropertyPro or stops posting documents, the page degrades visually (missing items, stale dates). No static snapshots that persist after the association stops maintaining compliance.

### 3.5 Association-Controlled Visibility

Associations opt in to making their transparency page public. They can disable it at any time. They cannot selectively hide individual items — it's all or nothing, to prevent cherry-picking.

---

## 4. Page Structure

### 4.1 URL Pattern

```
https://[subdomain].getpropertypro.com/transparency
```

Example: `https://sunset-condos.getpropertypro.com/transparency`

This extends the existing public route pattern at `/(public)/[subdomain]/`.

### 4.2 Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Association Logo]  [Association Name]                  │
│  [Community Type Badge: "Florida Condominium §718"]      │
│  [Address: Miami, FL]                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SCOPE NOTICE (above the fold, always visible)          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ This page shows document posting and meeting     │    │
│  │ notice data tracked within the PropertyPro       │    │
│  │ platform for [Association Name]. It reflects     │    │
│  │ data as of [current date/time].                  │    │
│  │                                                  │    │
│  │ This is NOT a legal audit, certification, or     │    │
│  │ guarantee of compliance with Florida Statute     │    │
│  │ §718. PropertyPro tracks document presence       │    │
│  │ and posting dates — not document accuracy        │    │
│  │ or completeness. For legal due diligence,        │    │
│  │ consult a Florida community association attorney. │    │
│  │                                                  │    │
│  │ What this page covers ›                          │    │
│  │ What this page does NOT cover ›                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 1: REQUIRED DOCUMENTS                          │
│  Governing Documents  ·  Financial Records  ·           │
│  Meeting Records  ·  Insurance & Contracts              │
│                                                         │
│  ┌─ Governing Documents ──────────────────────────┐     │
│  │                                                 │     │
│  │  Declaration of Condominium & Amendments        │     │
│  │  ● Posted   ·  Last updated: Mar 1, 2026       │     │
│  │  Statute: §718.111(12)(g)(2)(a)                 │     │
│  │                                                 │     │
│  │  Bylaws & Amendments                            │     │
│  │  ● Posted   ·  Last updated: Jan 15, 2026      │     │
│  │  Statute: §718.111(12)(g)(2)(b)                 │     │
│  │                                                 │     │
│  │  Articles of Incorporation                      │     │
│  │  ● Posted   ·  Last updated: Jan 15, 2026      │     │
│  │  Statute: §718.111(12)(g)(2)(c)                 │     │
│  │                                                 │     │
│  │  Rules & Regulations                            │     │
│  │  ○ Not yet posted                               │     │
│  │  Statute: §718.111(12)(g)(2)(d)                 │     │
│  │                                                 │     │
│  └─────────────────────────────────────────────────┘     │
│                                                         │
│  ┌─ Financial Records ─────────────────────────────┐    │
│  │                                                  │    │
│  │  Annual Budget (FY 2026)                         │    │
│  │  ● Posted   ·  Last updated: Dec 20, 2025       │    │
│  │  Statute: §718.112(2)(f)                         │    │
│  │                                                  │    │
│  │  Annual Financial Report (FY 2025)               │    │
│  │  ● Posted   ·  Last updated: Feb 28, 2026       │    │
│  │  Statute: §718.111(13)                           │    │
│  │                                                  │    │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [... Insurance, Contracts sections ...]                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 2: MEETING NOTICE HISTORY (Last 12 Months)    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Meeting              │ Type    │ Notice   │ Lead  │   │
│  │                      │         │ Posted   │ Time  │   │
│  │──────────────────────│─────────│──────────│───────│   │
│  │ Annual Owner Meeting │ Owner   │ Jan 5    │ 21d ● │   │
│  │ Feb 15, 2026         │         │          │       │   │
│  │──────────────────────│─────────│──────────│───────│   │
│  │ Board Meeting        │ Board   │ Feb 10   │ 52h ● │   │
│  │ Feb 12, 2026         │         │          │       │   │
│  │──────────────────────│─────────│──────────│───────│   │
│  │ Special Owner Mtg    │ Owner   │ Mar 1    │ 10d ○ │   │
│  │ Mar 11, 2026         │         │          │       │   │
│  │                      │         │          │ (req: │   │
│  │                      │         │          │  14d) │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ● Met statutory minimum  ○ Below statutory minimum     │
│                                                         │
│  Statutory minimums: Owner meetings require 14 days     │
│  advance notice. Board meetings require 48 hours.       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 3: MEETING MINUTES AVAILABILITY                │
│  (Rolling 12-Month Window per §718.111(12)(g)(2)(e))   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │  Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb  │   │
│  │  '25 '25 '25 '25 '25 '25 '25 '25 '25 '25 '26 '26│   │
│  │  [■] [■] [■] [■] [□] [■] [■] [■] [■] [■] [■] [□]│   │
│  │                                                   │   │
│  │  ■ Minutes posted  □ No minutes for this month    │   │
│  │  10 of 12 months have posted minutes              │   │
│  │                                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 4: OWNER PORTAL STATUS                         │
│                                                         │
│  Password-protected portal: Active ●                    │
│  Individual owner credentials: Supported ●              │
│  Public notices page: Active ●                          │
│  Statute: §718.111(12)(g)(1)                           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  SECTION 5: ABOUT THIS PAGE                             │
│                                                         │
│  Data source: PropertyPro platform                      │
│  Last refreshed: [live timestamp]                       │
│  Community type: Condominium (Florida §718)             │
│  Page enabled by: [Association Name] (opt-in)           │
│                                                         │
│  What this page tracks:                                 │
│  · Document presence and posting dates in the           │
│    PropertyPro owner portal                             │
│  · Meeting notice posting dates and advance notice      │
│    periods                                              │
│  · Owner portal accessibility                           │
│                                                         │
│  What this page does NOT track:                         │
│  · Document accuracy or completeness                    │
│  · Reserve funding or financial health                  │
│  · Structural inspections or SIRS status                │
│  · Insurance adequacy                                   │
│  · Compliance with non-website statutory requirements   │
│                                                         │
│  ─────────────────────────────────────────────────      │
│  Powered by PropertyPro · Florida Compliance Platform   │
│  Learn more at getpropertypro.com                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Data Sources (Mapping to Existing Schema)

### 5.1 Required Documents Section

**Source:** `compliance_checklist_items` table + `documents` table

The existing compliance checklist system tracks 3 items per community type (condo/HOA). For the transparency page, we need to **expand the checklist templates** to cover all 16 required document categories from the tech spec (§718.111(12)(g)(2)(a) through (p)).

| Transparency Page Item | Current Template Key | Status |
|---|---|---|
| Declaration of Condominium | — | **NEW: needs template** |
| Bylaws & Amendments | `718_bylaws` | EXISTS |
| Articles of Incorporation | — | **NEW: needs template** |
| Rules & Regulations | — | **NEW: needs template** |
| Meeting Minutes (12 months) | `718_minutes_rolling_12m` | EXISTS |
| Video Recordings (virtual) | — | **NEW: needs template** |
| Affidavits per Ch. 718 | — | **NEW: needs template** |
| Annual Budget | `718_budget` | EXISTS |
| Annual Financial Report | — | **NEW: needs template** |
| Insurance Policies | — | **NEW: needs template** |
| Executory Contracts List | — | **NEW: needs template** |
| Conflict of Interest Contracts | — | **NEW: needs template (conditional)** |
| Bids Received | — | **NEW: needs template (conditional)** |
| Inspection Reports | — | **NEW: needs template (conditional)** |
| SIRS | — | **NEW: needs template (conditional)** |
| Q&A Sheet | — | **NEW: needs template** |

**Migration needed:** Expand `CONDO_718_CHECKLIST_TEMPLATE` from 3 items → 16 items. Expand `HOA_720_CHECKLIST_TEMPLATE` similarly for §720 requirements. Existing checklist items are preserved; new items are added via POST /api/v1/compliance (idempotent).

### 5.2 Meeting Notice History

**Source:** `meetings` table — `startsAt`, `noticePostedAt`, `meetingType`

**Query:** For each meeting in the last 12 months where `noticePostedAt IS NOT NULL`, calculate:
- Lead time = `startsAt` - `noticePostedAt` (in days/hours)
- Required lead time = 14 days (owner) or 48 hours (board) via existing `getNoticeLeadDays()`
- Met requirement = lead time >= required lead time

**For meetings where `noticePostedAt IS NULL`:** Show "Notice posting date not recorded" — this is factually honest without implying the notice wasn't posted (the association may have posted it outside the platform).

### 5.3 Meeting Minutes Availability

**Source:** `documents` table filtered by category (meeting minutes) + `meetings` table

**Query:** For each month in the rolling 12-month window, check if a document in the "meeting minutes" category exists with a `createdAt` within that month. Display as a 12-month grid.

**Important nuance:** We can only show "minutes posted for this month" or "no minutes posted for this month." We cannot determine whether a meeting *occurred* but minutes weren't posted — we only know what's in our system.

### 5.4 Owner Portal Status

**Source:** Platform architecture (always true for PropertyPro communities)

These are inherent platform capabilities, not data-driven checks:
- Password-protected portal: Always true (platform design)
- Individual owner credentials: Always true (Supabase Auth per-user)
- Public notices page: True for condo_718 and hoa_720 (feature flag `hasPublicNoticesPage`)

### 5.5 Community Metadata

**Source:** `communities` table — `name`, `communityType`, `timezone`, `address`, `logoUrl`

---

## 6. New API Endpoint

### GET /api/v1/transparency?communityId={id}

**Authentication:** NONE (public endpoint)

**Rate limiting:** 60 requests/minute per IP (prevent scraping)

**Response shape:**

```typescript
interface TransparencyPageData {
  community: {
    name: string;
    communityType: 'condo_718' | 'hoa_720';
    address: { city: string; state: string };
    logoUrl: string | null;
    transparencyEnabled: boolean;
  };

  documents: {
    category: string; // "governing_documents", "financial_records", etc.
    items: Array<{
      title: string;
      statuteReference: string;
      status: 'posted' | 'not_posted' | 'conditional_not_required';
      postedAt: string | null; // ISO timestamp
      isConditional: boolean; // true for items that may not apply to all associations
    }>;
  }[];

  meetingNotices: {
    meetings: Array<{
      title: string;
      meetingType: string;
      startsAt: string;
      noticePostedAt: string | null;
      leadTimeDays: number | null;
      leadTimeHours: number | null;
      requiredLeadTimeDays: number;
      requiredLeadTimeHours: number;
      metRequirement: boolean | null; // null if noticePostedAt unknown
    }>;
    statutoryMinimums: {
      ownerMeetingDays: number;
      boardMeetingHours: number;
    };
  };

  minutesAvailability: {
    months: Array<{
      month: string; // "2026-01"
      label: string; // "Jan '26"
      hasMinutes: boolean;
    }>;
    totalMonths: number;
    monthsWithMinutes: number;
  };

  portalStatus: {
    passwordProtected: boolean;
    individualCredentials: boolean;
    publicNoticesPage: boolean;
  };

  metadata: {
    generatedAt: string; // ISO timestamp
    dataSource: 'PropertyPro Platform';
    pageEnabledByAssociation: boolean;
  };
}
```

**Access control:**
- Returns 404 if `transparencyEnabled` is false (association hasn't opted in)
- Returns 404 if community is `apartment` type (no compliance feature)
- Never returns document file contents or download links (just presence + dates)
- Never returns PII, financial amounts, or assessment data

---

## 7. Database Changes

### 7.1 New Column: `communities.transparency_enabled`

```sql
ALTER TABLE communities
ADD COLUMN transparency_enabled BOOLEAN NOT NULL DEFAULT false;
```

Associations opt in via Settings > Transparency Page. Default: disabled.

### 7.2 Expanded Compliance Templates

Expand `CONDO_718_CHECKLIST_TEMPLATE` from 3 → 16 items. Each new item follows the existing `ComplianceTemplateItem` interface:

```typescript
{
  templateKey: '718_declaration',
  title: 'Declaration of Condominium & Amendments',
  description: 'Recorded declaration and all amendments must be posted.',
  category: 'governing_documents',
  statuteReference: '§718.111(12)(g)(2)(a)',
  // No deadlineDays — permanent document, always required
}
```

**Migration strategy:** The POST /api/v1/compliance endpoint is idempotent — it checks existing `templateKey` values and only inserts new ones. Adding template items doesn't affect existing checklist entries.

### 7.3 New Column (Conditional Items): `compliance_checklist_items.is_conditional`

```sql
ALTER TABLE compliance_checklist_items
ADD COLUMN is_conditional BOOLEAN NOT NULL DEFAULT false;
```

For items like "Video Recordings of Virtual Meetings" or "Conflict of Interest Contracts" that may not apply to every association. The transparency page displays conditional items as "Not required for this association" rather than "Not posted" when the association marks them as not applicable.

---

## 8. New Files & Components

### 8.1 Route

```
apps/web/src/app/(public)/[subdomain]/transparency/page.tsx
```

Server component that:
1. Resolves community by subdomain (existing `resolvePublicCommunity()`)
2. Checks `transparency_enabled` — returns 404 if false
3. Calls internal transparency data aggregation
4. Renders the TransparencyPage component

### 8.2 API Route

```
apps/web/src/app/api/v1/transparency/route.ts
```

Public GET endpoint (no auth required). Rate-limited. Returns `TransparencyPageData`.

### 8.3 Components

```
apps/web/src/components/transparency/
├── transparency-page.tsx              # Full page layout
├── scope-notice.tsx                   # Legal scope notice (above the fold)
├── document-checklist-section.tsx     # Required documents grouped by category
├── document-checklist-item.tsx        # Individual document status row
├── meeting-notice-table.tsx           # Meeting notice history table
├── minutes-availability-grid.tsx      # 12-month grid visualization
├── portal-status-section.tsx          # Owner portal status checks
├── transparency-footer.tsx            # "About this page" + PropertyPro link
└── transparency-toggle.tsx            # Settings component for opt-in/out
```

### 8.4 Settings Integration

```
apps/web/src/app/(authenticated)/settings/transparency/page.tsx
```

Board members / CAM can:
- Toggle `transparency_enabled` on/off
- Preview what the public page will look like
- See a copy of the scope notice / disclaimer language
- Must acknowledge the scope limitations before first activation (stored as `transparency_acknowledged_at` on the community record)

### 8.5 Service Layer

```
apps/web/src/lib/services/transparency-service.ts
```

Aggregates data from:
- `complianceChecklistItems` (document presence)
- `meetings` (notice history)
- `documents` (minutes availability)
- `communities` (metadata)

Returns the `TransparencyPageData` shape. This is the single source of truth — both the API endpoint and the server-rendered page use this service.

---

## 9. Design Inspiration — Borrowed Patterns

### From Atlassian Statuspage:
- **Component-based layout:** Each statutory requirement is a "component" with its own status indicator
- **90-day history concept → 12-month history:** Meeting minutes grid shows 12 months of availability, similar to Statuspage's uptime calendar
- **Color-coded status:** Green (posted/met), Red (not posted/missed), Gray (not applicable/conditional)
- **Simple legend:** Status indicators explained in plain language at the bottom of each section

### From Vanta Trust Center:
- **"What we monitor" framing:** Scope notice explicitly lists what's covered
- **Live timestamp:** "Data as of [datetime]" updates on each page load
- **Gated vs. public:** Document *presence* is public; document *content* requires authentication
- **Brand-consistent design:** Page matches the association's portal branding

### From TransparencyHOA:
- **Buyer-friendly language:** Avoid legal jargon; explain statutory references in plain English
- **One-page summary:** Everything visible without extensive navigation
- **Community metadata:** Name, type, location prominently displayed

### From NYC Restaurant Grades:
- **No hiding failures:** If a document is missing, it shows as missing. Associations cannot suppress individual items.
- **Factual, not evaluative:** "Posted March 1" vs. "Grade A"
- **Public by default (once opted in):** No gating behind registration or NDA

---

## 10. Marketing & Growth Integration

### 10.1 SEO Value

Each transparency page is a publicly indexable page at `[subdomain].getpropertypro.com/transparency`. For Florida condo buyers searching "[association name] compliance" or "[building name] documents," this page ranks.

Structured data (JSON-LD) on the page identifies the organization, address, and page type for search engine rich results.

### 10.2 Backlink & Referral

The footer includes "Powered by PropertyPro — Florida Compliance Platform" with a link to `getpropertypro.com`. Every transparency page is a backlink and a referral channel.

### 10.3 Sales Enablement

During demos, the transparency page is a tangible differentiator: "Here's what Sunset Condos' public compliance page looks like. Your building doesn't have one yet. Want one?"

### 10.4 Retention Mechanism

Once an association has a live transparency page that buyers and realtors reference, switching away from PropertyPro means losing that page (and its SEO authority). This creates meaningful switching cost without vendor lock-in on data (we already support data export).

---

## 11. What This Feature Is NOT

To prevent scope creep and legal risk:

- **NOT a compliance score or rating.** No numbers, percentages, grades, or aggregated scores.
- **NOT a certification or verification.** No "Verified Compliant" language anywhere.
- **NOT a financial health indicator.** No reserve balances, assessment amounts, or delinquency rates.
- **NOT a structural safety indicator.** No SIRS pass/fail, inspection outcomes, or engineering assessments.
- **NOT a substitute for legal due diligence.** Stated explicitly on the page.
- **NOT mandatory.** Associations opt in. They can disable at any time.
- **NOT selective.** Once enabled, all tracked items are visible. No cherry-picking.

---

## 12. Implementation Sequence

### Phase 1: Expand Compliance Templates (Week 1)

- Expand `CONDO_718_CHECKLIST_TEMPLATE` from 3 → 16 items
- Expand `HOA_720_CHECKLIST_TEMPLATE` similarly
- Add `is_conditional` column to `compliance_checklist_items`
- Run migrations; re-seed demo data with expanded checklists
- Verify existing compliance dashboard still works with expanded items

### Phase 2: Build Transparency Data Service (Week 2)

- Create `transparency-service.ts` with data aggregation logic
- Build `GET /api/v1/transparency` public endpoint
- Add `transparency_enabled` column to `communities` table
- Write integration tests for the service and endpoint
- Verify rate limiting on public endpoint

### Phase 3: Build Transparency Page UI (Weeks 3-4)

- Create all components in `components/transparency/`
- Build the public route at `/(public)/[subdomain]/transparency/page.tsx`
- Implement the settings page for opt-in/out
- Add structured data (JSON-LD) for SEO
- Mobile-responsive design (this page will be viewed on phones by buyers at open houses)
- Cross-browser testing

### Phase 4: Demo Data & QA (Week 5)

- Update seed script to enable transparency for demo communities
- Populate demo communities with realistic expanded checklist data
- QA: verify all data displayed matches actual platform data
- QA: verify 404 for non-opted-in communities
- QA: verify apartment communities cannot enable transparency
- QA: verify rate limiting works
- Accessibility audit (WCAG 2.1 AA)

### Phase 5: Soft Launch (Week 6)

- Enable for demo communities only
- Use in sales demos
- Collect feedback from pilot CAM partners
- Monitor for any unexpected legal or UX concerns

---

## 13. Success Metrics

| Metric | Target (90 days post-launch) | How Measured |
|--------|------------------------------|--------------|
| Opt-in rate | >30% of active condo/HOA communities | `communities WHERE transparency_enabled = true` |
| Page views | >500/month across all transparency pages | Analytics on public route |
| Referral traffic | >50 clicks/month on "Powered by PropertyPro" link | UTM tracking on footer link |
| Sales demo conversion lift | Measurable A/B: demos with transparency page vs. without | CRM tracking |
| SEO impressions | Transparency pages appearing in search results within 60 days | Search Console |
| Support tickets about transparency page | <5/month (indicates confusion is low) | Zendesk/support tracking |

---

## 14. Open Questions

1. **Should the transparency page show the association's logo and branding, or standardized PropertyPro branding?** Recommendation: association branding for trust, PropertyPro footer for attribution. Mirror the Vanta model.

2. **Should we allow associations to add a custom message to the transparency page?** Recommendation: No. Custom messages create liability risk (association could add evaluative claims). Keep it data-only.

3. **Should conditional items (video recordings, SIRS, etc.) be hidden or shown as "Not required"?** Recommendation: Show as "Not required for this association" for maximum transparency. Hiding them could be interpreted as suppressing information.

4. **Do we need a separate mobile route (`/mobile/transparency`) or is responsive design sufficient?** Recommendation: Responsive design only. The page is read-only with no complex interactions. No need for a separate mobile route.

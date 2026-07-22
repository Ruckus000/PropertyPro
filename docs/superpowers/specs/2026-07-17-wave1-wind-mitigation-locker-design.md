# Wind-Mitigation Locker & Premium-Discount Alerts — Design

**Date:** 2026-07-17 · **Effort:** ~1.5 weeks · **Depends on:** [Wave 1 overview](./2026-07-17-wave1-overview-design.md) shared infra
**Migration:** `0027_wind_mitigation_reports`

## Context

The board uploads the building's wind-mitigation inspection report once; every
owner downloads it to hand their HO-6/wind insurer for premium credits. Florida
insurers are statutorily required to offer mitigation discounts (§627.0629);
the report documents building features (roof deck attachment, roof-to-wall,
opening protection) that individual owners cannot inspect themselves, and forms
are valid ~5 years. No competitor ships this; the differentiation is the
Florida-specific packaging (form families, expiry tracking, re-inspection
alerts), not the storage.

Verification caveats that shaped this design:

- **Two form families**: OIR-B1-1802 covers 1–3 story buildings only; 4+
  stories use Citizens MIT-BT II/III. Both must be supported or the high-rise
  condo audience is missed.
- **Form versions**: a revised OIR-B1-1802 took effect 2026-04-01; expiry
  logic and labels must be version-aware.
- **Hedged language only**: "may reduce the wind portion of your premium" —
  never promise amounts (attorney-reviewed constants).
- Opening protection is often unit-specific and excluded from building-level
  reports → v1 ships a building-level locker; per-unit doc slots are v1.1.

## Data model

New table `packages/db/src/schema/wind-mitigation-reports.ts`, following
`contracts.ts` conventions (bigserial id, `community_id` cascade FK, tstz
timestamps, `deleted_at`):

```
wind_mitigation_reports
  id                bigserial PK
  community_id      bigint → communities (cascade)
  document_id       bigint → documents (restrict)   -- the uploaded PDF row
  form_type         text NOT NULL                   -- 'oir_b1_1802' | 'mit_bt_ii' | 'mit_bt_iii'
  form_version      text NOT NULL DEFAULT 'pre_2026' -- 'pre_2026' | '2026_04'
  building_label    text                            -- optional, multi-building communities
  inspected_at      date NOT NULL
  expires_at        date NOT NULL                   -- default UI = inspected_at + 5 years, editable
  inspector_name    text
  inspector_license text
  notes             text
  last_alert_band   text                            -- expiry-alert dedupe (cron)
  created_by        uuid → users (restrict)
  created_at / updated_at / deleted_at
```

`form_type`/`form_version` as CHECK-constrained text (not pgEnum) so the 2026+
form churn never needs an enum migration. Partial unique index NOT needed —
multiple active reports per community are legal (multi-building).

**File storage rides the documents subsystem unchanged**: the PDF is uploaded
through the existing document uploader into the seeded **`Insurance`** category
(`packages/shared/src/default-document-categories.ts`), bucket `documents`,
path `communities/{id}/…` (validated by `validateUploadFilePath`). Download
reuses `GET /api/v1/documents/[id]/download` — signed 1-hour URL + existing
`document_accessed` audit event. The locker row is *metadata over* a library
document, so version history, search, and soft-delete come free.

**Migration `0027`**: table + FKs, `ENABLE/FORCE ROW LEVEL SECURITY`,
`pp_rls_enforce_tenant_scope` trigger, `tenant_admin_write` policy family
(member SELECT via `pp_rls_can_access_community`, admin-tier writes) — clone
the block structure of `0019_root_claim_disputes.sql`. Register in
`RLS_TENANT_TABLES` (`packages/db/src/schema/rls-config.ts`) with
`policyFamily: 'tenant_admin_write'`, export from `schema/index.ts`, append
journal idx 27.

## API

`apps/web/src/app/api/v1/wind-mitigation/contract.ts` + `route.ts`, using
`tenantScope` (so import `runRoute` from `@/lib/api/run-route`):

| Route | tenantScope | Permission | Notes |
|---|---|---|---|
| `GET /api/v1/wind-mitigation` | `{ in: 'query' }` | `insurance:read` | List active reports + computed expiry band. Small bounded list — still paginate per ADR-003 canonical shape. |
| `POST /api/v1/wind-mitigation` | `{ in: 'body' }` | `insurance:write` | Body: documentId, formType, formVersion, buildingLabel?, inspectedAt, expiresAt, inspector fields. Validates the referenced document belongs to the community and is not soft-deleted. `assertNotDemoGrace` + `requireActiveSubscriptionForMutation` + `logAuditEvent`. |
| `PATCH /api/v1/wind-mitigation/[id]` | `{ in: 'body' }` | `insurance:write` | Edit metadata (e.g. corrected expiry). |
| `DELETE /api/v1/wind-mitigation/[id]` | `{ in: 'query' }` | `insurance:write` | Soft delete (report superseded). Does not delete the library document. |

Handler chain and error shapes: copy `contracts/route.ts`
(`requireAuthenticatedUserId` → tenancy → membership →
`requirePlanFeature(cid, 'hasInsuranceHub')` → `requirePermission` →
`createScopedClient` → service). Service:
`apps/web/src/lib/services/wind-mitigation-service.ts`.

**Expiry banding** (service-level, reused by UI and cron): clone
`classifyExpirationWindow` from
`apps/web/src/lib/services/contract-renewal-alerts.ts` with bands
`'180_days' | '90_days' | '30_days' | 'expired' | 'none'` off `expires_at`
(wind-mit re-inspection has long lead times — 180-day early band). Map bands to
`complianceEscalation` tiers (`packages/ui/src/tokens/compliance.ts`):
none→calm, 180→aware, 90/30→urgent, expired→critical.

## UI

Page `/communities/[id]/insurance` (new — shared shell with spec 3; this spec
ships the page with the wind-mit section, spec 3 adds the policy section
above it). Server component per the contracts page pattern
(`requirePageAuthenticatedUserId`, `requirePageCommunityMembership`,
`getEffectiveFeaturesForPage` gate), rendering
`<PageHeader breadcrumb={<Breadcrumbs …/>} title="Insurance" …>` (breadcrumb
before other JSX props; guard-compliant).

Components in `apps/web/src/components/insurance/`:

- `wind-mitigation-section.tsx` — resident-first layout:
  - **Owner view (all roles):** each active report as a card — form label
    ("Wind Mitigation Inspection — OIR-B1-1802 (2026 form)"), inspected/expires
    dates with an escalation-tier StatusBadge (icon + text + color, never color
    alone), a **Download** button (existing download route,
    `?attachment=true`), and a **"Send to my insurance agent"** button that
    opens a prefilled `mailto:` (subject + body from an attorney-reviewed
    template constant: what the form is, that the owner's insurer must be
    asked to apply mitigation credits, attach-the-PDF instruction). Zero new
    backend; meets owners at their mail client.
  - **Admin view adds:** "Add report" (dialog: pick/upload document via the
    existing `document-uploader` targeting the Insurance category, then the
    metadata fields; `expires_at` auto-fills `inspected_at + 5y`), edit,
    supersede (soft-delete).
  - Disclaimer line under the section header from
    `insurance-disclaimers.ts` (hedged savings copy).
- Form-type picker copy explains the family rule inline: "1–3 story buildings:
  OIR-B1-1802 · 4+ stories: Citizens MIT-BT II/III" — the picker is the
  documentation.

Empty state (`empty-states.ts`): title "Share your wind-mitigation report",
description "Upload the building's inspection once — every owner can hand it to
their insurer to ask about wind-mitigation credits.", action "Add report"
(admin) / for residents: "Your board hasn't uploaded a report yet. Ask them
about wind-mitigation inspections." Constructive both ways.

RQ hooks `apps/web/src/hooks/use-wind-mitigation.ts` per `use-contracts.ts`
pattern (key factory, `requestJson`, self-invalidating mutations).

## Expiry alerts (cron)

In the shared `/api/v1/internal/insurance-alerts` cron (overview): for each
community with `hasInsuranceHub`, band every active report; on first entry into
`180_days`, `30_days`, and `expired` bands, email board-admin users a
`wind-mitigation-expiry-email.tsx` (new template in
`packages/email/src/templates/`, `EmailLayout` shell; model:
`subscription-expiry-warning.tsx`). "First entry" tracked with a
`last_alert_band` text column on the report row (add to the 0027 table:
`last_alert_band text`) — no separate alert-log table. Copy is the tutorial:
what expires, why re-inspection may renew owner discounts, one button to the
insurance page.

No resident emails in v1 (expiry is a board action); residents see the
escalation badge.

## Docs

- Help articles (`content/help/insurance/`, `featureGates: [hasInsuranceHub]`):
  `sharing-your-wind-mitigation-report.mdx` (board: 3 steps — get/locate the
  inspection PDF, upload, set dates) and
  `using-the-wind-mitigation-report.mdx` (resident: download → send to your
  agent → what to ask). Register `insurance` in `HELP_CATEGORY_META`.
- The June/renewal campaign email is out of scope for this spec (belongs to
  the snowbird-digest content stream once both exist).

## Tests & verification

- Route tests `apps/web/__tests__/wind-mitigation/wind-mitigation-route.test.ts`
  (contracts-route mock pattern; real `getFeaturesForCommunity`): list happy
  path, resident-can-read, resident-cannot-write (403), cross-community
  document reference rejected, apartment community 403 via feature gate.
- Banding unit tests for the expiry classifier (boundary days incl. leap-year
  spans).
- Cron test: band-transition sends once (last_alert_band dedupe).
- Manual: `/dev/agent-login?as=cam` upload + `?as=owner` download and mailto
  on Sunset Condos; verify audit-log rows.
- Guards: `guard:tenant-scope` (runRoute import), `guard:breadcrumbs`.

## Out of scope (v1.1+)

Per-unit opening-protection doc slots; OCR of form fields; multi-building
grouping UI beyond the `building_label` text; resident notification when a new
report is posted (candidate snowbird-digest item instead).

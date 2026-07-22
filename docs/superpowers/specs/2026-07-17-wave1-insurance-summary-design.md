# Building Insurance Summary + Certificate Request Relay — Design

**Date:** 2026-07-17 · **Effort:** ~2 weeks · **Depends on:** [Wave 1 overview](./2026-07-17-wave1-overview-design.md) + the `/communities/[id]/insurance` page shell from the [wind-mit spec](./2026-07-17-wave1-wind-mitigation-locker-design.md)
**Migration:** `0029_insurance_policies`

## Context

One always-current, owner-gated page per community summarizing the master
policy: carrier, policy type, limits, deductibles (including the hurricane
deductible), effective/expiry dates, the downloadable posted policy, and the
agent of record — plus a "request a certificate for my lender" flow that
relays a prefilled request to the agent. Every unit sale/refi requires lender
verification of the master policy (Fannie Mae B7-3-03); owners today pay
intermediaries $55–83 or chase agents by phone under a closing deadline.
§718.111(12)(g) already requires insurance policies posted for owners
(extended to 25+ unit condos from 2026-01-01) — this turns that obligation
into the feature.

Verification caveats that shaped this design (bright lines):

- **PropertyPro never mints certificates.** Lender-customized COIs are issued
  only by licensed agency staff. The product scope is (a) a factual summary
  page + the posted policy document, and (b) a **request relay** that emails
  the agent of record a prefilled payload. Copy: "PropertyPro sends your
  request to the association's insurance agent; the agent issues all
  certificates."
- **Reliance risk**: attorney-reviewed "summary only; agent-issued documents
  control; confers no rights" disclaimer on the page and in the relay email.
- **Renewal churn**: Florida master policies change carriers frequently —
  staleness must be self-evident (expiry-driven banner), and data entry
  happens at most annually at renewal.

## Data model

`packages/db/src/schema/insurance-policies.ts` — two tables, one migration:

```
insurance_policies
  id                   bigserial PK
  community_id         bigint → communities (cascade)
  policy_type          text NOT NULL          -- 'property' | 'wind' | 'flood' | 'liability' | 'umbrella' | 'other'
  carrier_name         text NOT NULL
  policy_number        text                   -- shown only to admin roles (see API)
  coverage_summary     text                   -- free text: limits as written on the dec page
  deductible_summary   text                   -- free text incl. hurricane deductible (often % of insured value — do NOT model as cents)
  effective_at         date
  expires_at           date NOT NULL
  agent_name           text
  agent_email          text                   -- relay target
  agent_phone          text
  document_id          bigint → documents (restrict)  -- posted policy / dec page in the library
  last_alert_band      text                   -- renewal-alert dedupe (cron)
  created_by           uuid → users (restrict)
  created_at / updated_at / deleted_at

insurance_certificate_requests
  id                   bigserial PK
  community_id         bigint → communities (cascade)
  policy_id            bigint → insurance_policies (cascade)
  requested_by         uuid → users (restrict)
  unit_label           text NOT NULL
  recipient_name       text NOT NULL          -- lender / title company
  recipient_email      text NOT NULL
  loan_number          text
  status               text NOT NULL DEFAULT 'sent'   -- 'sent' | 'failed'
  created_at / updated_at / deleted_at
```

Free-text `coverage_summary`/`deductible_summary` are deliberate: dec pages
express limits in heterogeneous forms (blanket limits, % hurricane
deductibles, sublimits); structured cents columns would force lossy
paraphrasing — exactly the reliance risk the attorney flagged. The page shows
what the dec page says, labeled with its as-of date.

**Migration `0029`**: both tables, RLS (`tenant_admin_write` family;
certificate_requests INSERT must be member-allowed since residents create
them — use the member-insert variant used by resident-submitting tables such
as maintenance requests), write-scope triggers, `RLS_TENANT_TABLES` entries,
schema barrel exports, journal idx 29.

## API

`apps/web/src/app/api/v1/insurance/` (contract.ts + route.ts + nested route
for requests), tenantScope + `runRoute` from `@/lib/api/run-route`,
feature-gated `requirePlanFeature(cid, 'hasInsuranceHub')`:

| Route | tenantScope | Permission | Notes |
|---|---|---|---|
| `GET /api/v1/insurance/policies` | `{ in: 'query' }` | `insurance:read` | Active policies. **`policy_number` is stripped for non-admin membership roles in the handler** (owners don't need it; it's mildly sensitive). |
| `POST /api/v1/insurance/policies` | `{ in: 'body' }` | `insurance:write` | Create; validates `document_id` belongs to community. `assertNotDemoGrace`, subscription guard, `logAuditEvent`. |
| `PATCH /api/v1/insurance/policies/[id]` | `{ in: 'body' }` | `insurance:write` | Renewal update (typical annual touch). |
| `DELETE /api/v1/insurance/policies/[id]` | `{ in: 'query' }` | `insurance:write` | Soft delete. |
| `POST /api/v1/insurance/certificate-requests` | `{ in: 'body' }` | `insurance:read` | **Resident-callable.** Body: policyId, unitLabel, recipientName, recipientEmail, loanNumber?. Sends the relay email, records the row, audit-logs. **Rate-limited** via `apps/web/src/lib/middleware/rate-limiter.ts` (e.g. 5/user/day) — this endpoint emails an external party on user input. 422 with a friendly error if the policy has no `agent_email`. |
| `GET /api/v1/insurance/certificate-requests` | `{ in: 'query' }` | `insurance:read` | Residents see their own; admins see all (filter in handler by role). Paginated. |

Service: `apps/web/src/lib/services/insurance-service.ts` (policies CRUD,
policy-number redaction, relay orchestration).

### The relay email

`packages/email/src/templates/certificate-request-email.tsx`. **To:** the
policy's `agent_email`. **Reply-To: the requesting owner's email** — the agent
replies straight to the owner and PropertyPro exits the loop (no inbound mail
handling). Body: community name + unit, requester name/contact, lender/title
recipient name + email, loan number, which policy (carrier, policy number —
the agent-facing email may include it), and the attorney-reviewed framing
("The owner requests a certificate of insurance for the recipient below.
PropertyPro is relaying this request on the association's behalf; please
issue directly."). A confirmation copy goes to the requester ("What happens
next: the agent typically responds within a few business days; your closing
contact is CC'd on nothing yet — forward the certificate when you receive
it."). `category: 'transactional'` (user-initiated, no unsubscribe needed).

External-recipient note (per the working agreement on external deps): no new
service — Resend already sends to arbitrary recipients — but this is the
platform's first user-triggered email to a non-member third party; the rate
limit + audit log + fixed template (no free-text body) are the abuse
controls.

## UI

Extends `apps/web/src/components/insurance/` from the wind-mit spec; the
policy section renders **above** the wind-mit section on
`/communities/[id]/insurance`:

- `insurance-summary-section.tsx`:
  - **Owner view:** one card per policy — type badge, carrier, coverage and
    deductible summaries verbatim, effective→expiry dates ("per declarations
    dated {effective_at}"), Download (existing documents download route),
    and **"Request a certificate for my lender"** → dialog (unit auto-filled
    from the member's unit where known; recipient name/email; loan number
    optional; submit → success toast "Request sent to {agent name}. They'll
    reply to your email."). Below the cards: the standing disclaimer
    (`insurance-disclaimers.ts`) and the agent-of-record contact block (name,
    phone, email) — half the value is just making the agent findable.
  - **Expired-policy banner:** when `expires_at < today`, an `AlertBanner`
    (danger) replaces the section header: "This summary may be out of date —
    the policy on file expired {date}." Residents see honesty; admins see an
    Update button. Staleness is self-evident by design.
  - **Admin view adds:** Add/Edit policy dialog (document picker into the
    seeded `Insurance` category, same uploader flow as wind-mit), and a small
    "Certificate requests" table (existing DataTable pattern) so the board
    sees volume.
- Empty state: title "Add the master policy", description "Post the
  declarations page once — owners get the summary, the download, and a
  one-click certificate request at every sale or refi.", action "Add policy";
  resident variant: "The board hasn't posted the master policy yet."

Hooks `apps/web/src/hooks/use-insurance.ts` (policies + certificate-request
mutation, `requestJson`, key factories, invalidation).

## Renewal alerts (cron)

In the shared `/api/v1/internal/insurance-alerts` cron: band `expires_at`
with `'60_days' | '30_days' | 'expired'`; on first band entry
(`last_alert_band` dedupe) email board admins
`insurance-renewal-reminder-email.tsx` — "Policy renews {date}. After
renewal, update the summary and upload the new declarations page (2
minutes)." The reminder email is the maintenance documentation; the annual
touch is the only recurring board effort in this feature.

## Docs

- `content/help/insurance/posting-your-master-policy.mdx` (board: add policy,
  what to enter, what happens at renewal) and
  `content/help/insurance/requesting-an-insurance-certificate.mdx` (resident:
  when you need one — sale/refi; 3 steps; "the agent issues it, not
  PropertyPro"). `featureGates: [hasInsuranceHub]`.
- The request dialog's inline copy carries the essential resident education;
  articles are fallback.

## Tests & verification

- Route tests: policy-number redaction per role; resident certificate-request
  happy path; rate-limit 429; missing agent_email 422; cross-tenant policyId
  rejected; feature-gate 403; admin-only writes.
- Relay email snapshot test (template renders payload; Reply-To set).
- Cron band-transition dedupe test.
- Manual: `/dev/agent-login?as=cam` add policy on Sunset Condos →
  `?as=owner` submit a certificate request → verify test inbox holds the
  agent email (Reply-To = owner) + requester confirmation; verify audit rows;
  expired-policy banner by backdating `expires_at`.
- Guards: tenant-scope, breadcrumbs, design-tokens (AlertBanner/status tokens
  only, no raw colors).

## Out of scope (v1.1+)

Public (unauthenticated) summary page (owner-gated only in v1 — matches the
statute's password-protected posture; revisit with board opt-in); OCR of dec
pages; agent portal/status tracking on requests; HO-6 wallet (separate
Wave 4 feature); multiple agent contacts per policy.

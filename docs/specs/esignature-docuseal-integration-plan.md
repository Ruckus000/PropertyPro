# E-Signature Integration Plan: DocuSeal + PropertyPro

**Status:** Draft
**Date:** 2026-03-10
**Priority:** Security > Compliance > UX

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 1: Foundation](#3-phase-1-foundation--infrastructure--schema)
4. [Phase 2: Template Management](#4-phase-2-template-management)
5. [Phase 3: Signing Workflow](#5-phase-3-signing-workflow)
6. [Phase 4: Webhook Processing & Audit](#6-phase-4-webhook-processing--audit-trail)
7. [Phase 5: Document Storage & Compliance](#7-phase-5-document-storage--compliance)
8. [Phase 6: Notifications & UX](#8-phase-6-notifications--ux-polish)
9. [Phase 7: Mobile & Accessibility](#9-phase-7-mobile--accessibility)
10. [Security Design](#10-security-design)
11. [Florida Compliance Requirements](#11-florida-compliance-requirements)
12. [Database Schema](#12-database-schema)
13. [API Routes](#13-api-routes)
14. [Environment & Configuration](#14-environment--configuration)
15. [Testing Strategy](#15-testing-strategy)
16. [Rollout & Migration](#16-rollout--migration)

---

## 1. Executive Summary

Integrate DocuSeal (cloud-hosted initially, self-hosted migration path) into PropertyPro to enable legally binding e-signatures for Florida condo/HOA documents. The integration covers:

- **Template management** for board members and CAMs to create reusable signing templates
- **Embedded signing** for residents to sign documents without leaving PropertyPro
- **Audit trail** with full compliance for ESIGN Act and Florida UETA (§668.50)
- **Multi-tenant isolation** — each community's templates and submissions are fully isolated
- **Webhook-driven status tracking** for real-time document lifecycle management

**Key design decisions:**
- DocuSeal Cloud API for initial launch (fastest time-to-market)
- Self-hosted DocuSeal (Docker + PostgreSQL) as Phase 2 cost optimization
- All DocuSeal API calls go through PropertyPro server (never expose API key to client)
- Signed documents stored in both DocuSeal and Supabase Storage (redundancy)
- `external_id` used throughout for PropertyPro ↔ DocuSeal entity mapping

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PropertyPro Frontend                        │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐ │
│  │  Template Builder │    │   Signing Form   │    │  Status/Audit │ │
│  │  <DocusealBuilder>│    │  <DocusealForm>  │    │   Dashboard   │ │
│  │  (JWT-authed)     │    │  (slug-authed)   │    │               │ │
│  └────────┬─────────┘    └────────┬─────────┘    └──────┬────────┘ │
│           │                       │                      │          │
└───────────┼───────────────────────┼──────────────────────┼──────────┘
            │                       │                      │
            ▼                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PropertyPro API Layer                            │
│                                                                     │
│  POST /api/v1/esign/templates     → DocuSeal API (create template) │
│  POST /api/v1/esign/submissions   → DocuSeal API (create submission│
│  GET  /api/v1/esign/submissions   → Local DB (list & status)       │
│  POST /api/v1/webhooks/docuseal   → Webhook handler (status sync)  │
│  GET  /api/v1/esign/audit/:id     → Local audit trail              │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Auth Check  │  │ Tenant Scope │  │  RBAC (board/cam only     │  │
│  │  (session)   │  │ (community)  │  │  for template mgmt)       │  │
│  └─────────────┘  └──────────────┘  └───────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────┐   ┌──────────────────┐   ┌─────────────────────┐
│   DocuSeal API   │   │  PropertyPro DB  │   │  Supabase Storage   │
│  (Cloud/Self)    │   │  (PostgreSQL)    │   │  (signed PDFs)      │
│                  │   │                  │   │                     │
│  Templates       │   │  esign_templates │   │  communities/       │
│  Submissions     │   │  esign_submiss.  │   │    {id}/esign/      │
│  Webhooks        │   │  esign_signers   │   │      {docId}.pdf    │
│  Audit Certs     │   │  audit_log       │   │                     │
└──────────────────┘   └──────────────────┘   └─────────────────────┘
```

---

## 3. Phase 1: Foundation — Infrastructure & Schema

**Goal:** Database schema, DocuSeal client, environment config, and security primitives.

### Tasks

#### 1.1 Environment Configuration
- Add to `.env.local`:
  ```
  DOCUSEAL_API_KEY=<api-key>
  DOCUSEAL_API_URL=https://api.docuseal.com
  DOCUSEAL_WEBHOOK_SECRET=<webhook-secret>
  DOCUSEAL_USER_EMAIL=<admin-email>
  ```
- Add env validation in app startup (fail fast if missing)

#### 1.2 Install Dependencies
```bash
pnpm add @docuseal/react @docuseal/api jsonwebtoken
pnpm add -D @types/jsonwebtoken
```

#### 1.3 DocuSeal Client Service
Create `apps/web/src/lib/services/docuseal-client.ts`:
- Singleton wrapper around `@docuseal/api`
- All API calls go through this service (never import SDK directly in routes)
- Methods: `createTemplate()`, `getTemplate()`, `createSubmission()`, `getSubmission()`, `listSubmitters()`, `updateSubmitter()`, `verifyDocument()`
- Error handling: Map DocuSeal errors to PropertyPro `AppError` subclasses
- Request logging: Log all API calls with request_id for traceability
- Rate limit awareness: Implement retry with exponential backoff

#### 1.4 JWT Service for Builder Auth
Create `apps/web/src/lib/services/docuseal-jwt.ts`:
- `generateBuilderToken(userEmail, templateOptions)` → HS256 JWT
- Signs with `DOCUSEAL_API_KEY` as secret
- Short TTL (15 minutes) for security
- Includes `user_email`, `integration_email`, `external_id`, `folder_name`

#### 1.5 Database Schema
Add new tables to `packages/db/src/schema/esign.ts` (see [Section 12](#12-database-schema) for full schema).

#### 1.6 Database Migration
- Generate migration: `pnpm --filter @propertypro/db db:generate`
- Test migration: `pnpm --filter @propertypro/db db:migrate`

#### 1.7 Scoped Client Registration
- Register new tables (`esignTemplates`, `esignSubmissions`, `esignSigners`, `esignEvents`) in scoped-client's table registry
- All tables have `communityId` FK for automatic tenant scoping
- `esignEvents` is append-only (exempt from soft-delete, no UPDATE/DELETE)

---

## 4. Phase 2: Template Management

**Goal:** Board members and CAMs can create, edit, and manage e-signature templates.

### Tasks

#### 2.1 API Routes

**`POST /api/v1/esign/templates`** — Create template
- Auth: Elevated roles only (board_member, board_president, cam, property_manager_admin)
- Input: `name`, `documentUrl` (Supabase storage path) or `html` (for generated templates)
- Flow:
  1. Validate role permissions via RBAC
  2. Generate presigned download URL for the source document
  3. Call DocuSeal API `POST /templates/pdf` (or `/html`) with `external_id = community:{communityId}:template:{uuid}`
  4. Insert `esign_templates` row with DocuSeal `template_id` mapping
  5. Audit log: `esign_template.created`
- Output: Template record with ID

**`GET /api/v1/esign/templates`** — List templates
- Auth: Elevated roles
- Scoped to community via `createScopedClient()`
- Supports pagination, filtering by status (active/archived)

**`GET /api/v1/esign/templates/:id`** — Get template detail
- Auth: Elevated roles
- Returns template metadata + DocuSeal template info (field names, roles)

**`DELETE /api/v1/esign/templates/:id`** — Archive template
- Auth: Elevated roles
- Soft-delete in PropertyPro DB
- Archive in DocuSeal via `DELETE /templates/{id}`
- Audit log: `esign_template.archived`

#### 2.2 Template Builder Page

**Route:** `/dashboard/esign/templates/new`
- Server component generates JWT token
- Renders `<DocusealBuilder token={jwt} />` client component
- `onSave` callback → server action to sync template to DB
- JWT payload includes:
  - `folder_name`: `community_{communityId}` (DocuSeal-side isolation)
  - `external_id`: `community:{communityId}:template:{uuid}`
  - `integration_email`: current user's email

#### 2.3 Template List Page

**Route:** `/dashboard/esign/templates`
- Server component fetches templates from local DB (scoped)
- Table: name, created date, field count, last used, status
- Actions: Edit, Clone, Archive, Send for Signing

#### 2.4 Pre-Built Florida Templates
Seed common templates via HTML API:
- **Board Meeting Proxy Form** — Proxy designation with voter info fields
- **Owner Consent Form** — General-purpose consent with signature
- **Maintenance Authorization** — Work authorization with scope and cost
- **Lease Agreement Addendum** — Amendment signature page
- **Rule Violation Acknowledgment** — Violation notice with acknowledgment signature
- **Assessment Payment Agreement** — Payment plan with terms and signature

Each template uses HTML field tags for auto-population from PropertyPro data.

---

## 5. Phase 3: Signing Workflow

**Goal:** Send documents for signing and embed the signing experience.

### Tasks

#### 3.1 API Routes

**`POST /api/v1/esign/submissions`** — Create signing request
- Auth: Elevated roles
- Input:
  ```typescript
  {
    templateId: string;           // PropertyPro template ID
    signers: Array<{
      email: string;
      name: string;
      role: string;               // Template role (e.g., "Owner", "Board Member")
      userId?: string;            // PropertyPro user ID (if known)
      fields?: Array<{            // Pre-filled fields
        name: string;
        default_value: string;
        readonly?: boolean;
      }>;
    }>;
    sendEmail?: boolean;          // Default: false (use embedded signing)
    expiresAt?: string;           // ISO 8601
    message?: {
      subject: string;
      body: string;
    };
  }
  ```
- Flow:
  1. Validate template exists and belongs to community
  2. Validate signers (email format, role matches template)
  3. Pre-fill community data (name, address, unit number) as readonly fields
  4. Call DocuSeal `POST /submissions` with:
     - `send_email: false` (default — use embedded form)
     - `external_id` on each submitter mapping to PropertyPro user
  5. Store submission + signer records in local DB
  6. Audit log: `esign_submission.created`
- Output: Submission record with signer slugs for embedded forms

**`GET /api/v1/esign/submissions`** — List submissions
- Auth: Elevated roles see all community submissions; owners/tenants see only their own
- Filters: status (pending, completed, declined, expired), templateId, signerEmail
- Pagination support

**`GET /api/v1/esign/submissions/:id`** — Submission detail
- Auth: Elevated roles or involved signer
- Returns: submission status, signer statuses, document URLs (if complete), audit events

**`GET /api/v1/esign/submissions/:id/sign`** — Get signing URL
- Auth: Only the specific signer (match by userId or email)
- Returns: Signer `slug` for use with `<DocusealForm />`
- Security: Validate the requesting user matches the signer's email/userId

**`DELETE /api/v1/esign/submissions/:id`** — Cancel submission
- Auth: Elevated roles
- Only if status is `pending`
- Archive in DocuSeal
- Update local status to `cancelled`
- Audit log: `esign_submission.cancelled`

#### 3.2 Embedded Signing Page

**Route:** `/dashboard/esign/sign/:submissionId`
- Server component:
  1. Validate user is an authorized signer
  2. Fetch signer slug from DB
  3. Render signing wrapper
- Client component (`EsignForm.tsx`):
  ```tsx
  'use client';
  import { DocusealForm } from '@docuseal/react';

  export function EsignForm({ slug, onComplete }: Props) {
    return (
      <DocusealForm
        src={`https://docuseal.com/s/${slug}`}
        onComplete={handleComplete}
        customCss={brandingCss}
        logo={communityLogo}
        language="en"
        sendCopyEmail={true}
        backgroundColor="#ffffff"
        completedMessage="Thank you! Your signed document has been saved."
      />
    );
  }
  ```
- `onComplete` handler → server action to update local status immediately (don't wait for webhook)

#### 3.3 Signing Status Dashboard

**Route:** `/dashboard/esign`
- Overview cards: Pending, Completed, Expired counts
- Recent submissions table with status indicators
- Quick actions: Send reminder, View document, Download signed PDF

#### 3.4 Signer Notification Flow
- When `sendEmail: true`, DocuSeal handles email delivery
- When `sendEmail: false` (embedded signing):
  1. PropertyPro sends notification via existing notification service
  2. Email includes link to `/dashboard/esign/sign/:submissionId`
  3. Respects user's notification preferences (immediate vs digest)
  4. Uses new `EsignRequestEmail` React email component

---

## 6. Phase 4: Webhook Processing & Audit Trail

**Goal:** Real-time status sync and comprehensive audit logging.

### Tasks

#### 4.1 Webhook Endpoint

**`POST /api/v1/webhooks/docuseal`**
- Auth: Webhook secret verification (header-based, configured in DocuSeal)
- **No session required** (add to middleware token-authenticated routes list)
- Events handled:

  | Event | Action |
  |-------|--------|
  | `form.completed` | Update signer status → `completed`, store values, log event |
  | `submission.completed` | Update submission status → `completed`, download & store signed PDF, log event |
  | `submission.created` | Confirm/sync submission record |
  | `template.created` | Confirm/sync template record |

- Processing flow for `form.completed`:
  1. Verify webhook secret header
  2. Extract `external_id` → resolve PropertyPro signer record
  3. Update `esign_signers`: status, completedAt, signedValues (JSONB)
  4. Insert `esign_events`: signer_completed with IP, timestamp, values
  5. Audit log: `esign_signer.completed`

- Processing flow for `submission.completed`:
  1. Verify webhook secret header
  2. Extract submission → resolve PropertyPro submission record
  3. Update `esign_submissions`: status → `completed`, completedAt
  4. Download signed PDF from DocuSeal document URL
  5. Upload to Supabase Storage: `communities/{communityId}/esign/{submissionId}/signed.pdf`
  6. Download audit certificate from DocuSeal
  7. Upload audit certificate to Supabase Storage alongside signed PDF
  8. Insert `esign_events`: submission_completed
  9. Optionally create a `documents` record (link signed doc to document library)
  10. Send completion notification to all parties
  11. Audit log: `esign_submission.completed`

#### 4.2 Webhook Security
- **Secret verification:** Compare webhook header against `DOCUSEAL_WEBHOOK_SECRET`
- **Idempotency:** Store webhook event IDs in `esign_events` with unique constraint; skip duplicates
- **Replay protection:** Reject events older than 5 minutes (timestamp check)
- **Request validation:** Validate expected payload structure with Zod schema

#### 4.3 Audit Trail

**`esign_events` table** (append-only):
- Every signing action logged: created, viewed, signed, completed, declined, expired, cancelled
- Stores: IP address, user agent, timestamp, field values, document URLs
- Exempt from soft-delete filtering (like `compliance_audit_log`)
- No UPDATE or DELETE operations permitted

**`GET /api/v1/esign/audit/:submissionId`** — Audit trail endpoint
- Auth: Elevated roles only
- Returns: chronological list of all events for a submission
- Includes: DocuSeal Certificate of Signature URL

**Compliance audit integration:**
- All e-sign actions also logged in the existing `compliance_audit_log` table
- Resource type: `esign_template`, `esign_submission`, `esign_signer`
- Actions: `created`, `sent`, `viewed`, `signed`, `completed`, `declined`, `expired`, `cancelled`, `downloaded`

---

## 7. Phase 5: Document Storage & Compliance

**Goal:** Signed documents integrated into the document library with compliance tracking.

### Tasks

#### 5.1 Signed Document Storage
- On `submission.completed`:
  1. Download final signed PDF from DocuSeal
  2. Upload to Supabase Storage: `communities/{communityId}/esign/{submissionId}/signed-{timestamp}.pdf`
  3. Download DocuSeal audit certificate
  4. Upload certificate: `communities/{communityId}/esign/{submissionId}/audit-certificate-{timestamp}.pdf`
  5. Create record in `documents` table with:
     - `categoryId`: mapped to appropriate category (e.g., "Signed Documents")
     - `title`: template name + date
     - `mimeType`: `application/pdf`
     - `filePath`: Supabase storage path
     - `uploadedBy`: submission creator's userId
  6. Trigger PDF text extraction (existing fire-and-forget flow)

#### 5.2 Document Category
- Add system document category: "E-Signed Documents" (`esigned_documents`)
- `isSystem: true` (cannot be deleted by users)
- Add to `KNOWN_DOCUMENT_CATEGORY_KEYS` in shared access policies
- Access policy: All roles can view their own signed documents; elevated roles can view all

#### 5.3 Compliance Dashboard Integration
- Add e-signature metrics to `/api/v1/compliance`:
  - Documents pending signature count
  - Documents signed within 30-day window
  - Expired/declined documents requiring attention
- Compliance alert: Documents pending signature > 14 days

#### 5.4 Document Verification
- **`POST /api/v1/esign/verify`** — Verify signed PDF
  - Accept PDF upload
  - Forward to DocuSeal `POST /tools/verify`
  - Return verification result (valid/invalid + certificate details)
  - Audit log: `esign_document.verified`

---

## 8. Phase 6: Notifications & UX Polish

**Goal:** Seamless notification integration and polished user experience.

### Tasks

#### 6.1 Notification Events
Add to existing notification service:

| Event | Recipients | Channel |
|-------|-----------|---------|
| `esign_request` | Signer(s) | Email (immediate) |
| `esign_reminder` | Pending signer(s) | Email (immediate) |
| `esign_completed` | Submission creator + all signers | Email (respects preferences) |
| `esign_declined` | Submission creator | Email (immediate) |
| `esign_expired` | Submission creator + pending signers | Email (immediate) |

#### 6.2 Email Templates
Create React email components in `packages/email/`:
- `EsignRequestEmail` — "You have a document to sign" with CTA button
- `EsignReminderEmail` — "Reminder: document awaiting your signature"
- `EsignCompletedEmail` — "All parties have signed" with download link
- `EsignDeclinedEmail` — "A signer has declined"
- `EsignExpiredEmail` — "Document signing has expired"

#### 6.3 Dashboard Widgets
- **Pending Signatures Widget** on main dashboard — shows count + list for current user
- **Recent E-Sign Activity** feed — last 5 signing events for community

#### 6.4 Branded Signing Experience
- Pull community branding (logo, colors) from `communities` table
- Pass to `<DocusealForm />` via `logo` and `customCss` props
- Match PropertyPro's design system (Tailwind colors → DocuSeal CSS overrides)

#### 6.5 Automatic Reminders
- Cron job (or extend existing `/api/v1/internal/` cron):
  - Query pending submissions approaching expiry
  - Send reminders at: 7 days before, 3 days before, 1 day before expiry
  - Update `esign_signers.lastReminderAt`
  - Respect a max of 3 reminders per signer

---

## 9. Phase 7: Mobile & Accessibility

**Goal:** Full signing capability on mobile web routes.

### Tasks

#### 7.1 Mobile Signing Route
- `/mobile/esign/sign/:submissionId` — mobile-optimized signing page
- `<DocusealForm />` with mobile-friendly props:
  - `expand: true`
  - `autoscroll: true`
  - Full-width layout
  - Touch-optimized signature pad

#### 7.2 Mobile Dashboard
- `/mobile/esign` — pending signatures list
- Tap to sign inline
- Status badges (pending/completed/expired)

#### 7.3 Accessibility
- Ensure embedded DocuSeal components meet WCAG 2.1 AA
- Add `aria-label` attributes to signing flow wrapper
- Keyboard navigation support for the signing form
- Screen reader announcements for status changes

---

## 10. Security Design

### 10.1 API Key Protection
- `DOCUSEAL_API_KEY` stored only in server-side env vars
- Never imported in client components or exposed via API responses
- All DocuSeal API calls routed through PropertyPro server

### 10.2 JWT Security (Builder)
- HS256 signed with API key (never exposed to client)
- 15-minute TTL (short-lived)
- `integration_email` bound to authenticated user
- Generated fresh per page load (no caching)

### 10.3 Signing URL Security
- Signer slugs are opaque, unguessable tokens (generated by DocuSeal)
- PropertyPro validates the requesting user matches the signer before revealing slug
- Slugs are never exposed in list views or to non-signers

### 10.4 Webhook Security
- Secret header verification on every webhook request
- Idempotency keys prevent duplicate processing
- Timestamp validation (reject stale events)
- Zod schema validation on payload structure
- Webhook endpoint added to middleware's token-authenticated route list

### 10.5 Multi-Tenant Isolation
- `external_id` format: `community:{communityId}:template:{uuid}` / `community:{communityId}:submission:{uuid}`
- DocuSeal `folder_name`: `community_{communityId}` (organizational isolation)
- All local DB queries go through `createScopedClient(communityId)` — automatic tenant filtering
- Signer slug access validated against community membership

### 10.6 Data Residency
- Cloud: DocuSeal stores documents on their infrastructure
- Self-hosted: All document data stays on PropertyPro's infrastructure
- Signed PDFs always copied to Supabase Storage (PropertyPro-controlled)
- Audit certificates always copied to Supabase Storage

### 10.7 RBAC for E-Signatures
Add to RBAC matrix (`packages/shared/src/rbac-matrix.ts`):

| Resource | Action | owner | tenant | board_member | board_president | cam | site_manager | pm_admin |
|----------|--------|-------|--------|-------------|----------------|-----|-------------|----------|
| esign | read | own | own | all | all | all | all | all |
| esign | write | — | — | yes | yes | yes | — | yes |
| esign | sign | yes | yes | yes | yes | yes | yes | yes |

- `read:own` = can see submissions where they are a signer
- `read:all` = can see all community submissions
- `write` = can create templates and send for signing
- `sign` = can sign documents sent to them

---

## 11. Florida Compliance Requirements

### 11.1 Legal Framework
- **ESIGN Act (federal):** E-signatures have same legal standing as handwritten
- **Florida UETA (§668.50):** Electronic signatures cannot be denied legal effect
- **§718.111(12):** Condo association record-keeping (electronic records acceptable)
- **§720.303:** HOA record-keeping requirements

### 11.2 Compliance Checklist

| Requirement | Implementation |
|-------------|---------------|
| **Intent to sign** | DocuSeal requires explicit "Submit" action; signature field is required |
| **Consent to e-process** | Consent checkbox before first signing (stored in `esign_events`) |
| **Signer attribution** | Email verification + audit trail links signature to person |
| **Record integrity** | DocuSeal applies digital signature (cryptographic hash); PDF/A archival |
| **Record retention** | Signed PDFs stored in Supabase Storage with no auto-expiration |
| **Audit trail** | Full event log: creation, viewing, signing, completion with timestamps + IPs |
| **30-day posting rule** | Signed documents auto-posted to document library on completion |

### 11.3 Consent Flow
Before a user signs their first document:
1. Present Florida UETA consent disclosure
2. Require explicit opt-in checkbox: "I consent to conduct this transaction electronically"
3. Store consent record in `esign_events` with timestamp, IP, user agent
4. Consent persists per user (one-time, revocable)
5. Provide option to withdraw consent and request paper process

---

## 12. Database Schema

### New Tables

```sql
-- E-signature templates (maps to DocuSeal templates)
CREATE TABLE esign_templates (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id),
  docuseal_template_id  INTEGER NOT NULL,     -- DocuSeal's template ID
  external_id   TEXT NOT NULL UNIQUE,          -- community:{cid}:template:{uuid}
  name          TEXT NOT NULL,
  description   TEXT,
  source_document_path  TEXT,                  -- Supabase storage path of source doc
  template_type TEXT,                          -- proxy, consent, lease_addendum, etc.
  fields_schema JSONB,                         -- Cached field definitions from DocuSeal
  status        TEXT NOT NULL DEFAULT 'active', -- active, archived
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ                    -- soft delete
);

-- E-signature submissions (a specific signing request)
CREATE TABLE esign_submissions (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id),
  template_id   BIGINT NOT NULL REFERENCES esign_templates(id),
  docuseal_submission_id  INTEGER,             -- DocuSeal's submission ID
  external_id   TEXT NOT NULL UNIQUE,          -- community:{cid}:submission:{uuid}
  status        TEXT NOT NULL DEFAULT 'pending', -- pending, completed, declined, expired, cancelled
  send_email    BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  signed_document_path  TEXT,                  -- Supabase storage path of signed PDF
  audit_certificate_path TEXT,                 -- Supabase storage path of audit cert
  linked_document_id BIGINT REFERENCES documents(id), -- Link to document library
  message_subject TEXT,
  message_body  TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ                    -- soft delete
);

-- Individual signers within a submission
CREATE TABLE esign_signers (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id),
  submission_id BIGINT NOT NULL REFERENCES esign_submissions(id),
  docuseal_submitter_id  INTEGER,              -- DocuSeal's submitter ID
  external_id   TEXT NOT NULL UNIQUE,          -- community:{cid}:signer:{uuid}
  user_id       UUID REFERENCES users(id),     -- PropertyPro user (if known)
  email         TEXT NOT NULL,
  name          TEXT,
  role          TEXT NOT NULL,                 -- Template role (e.g., "Owner")
  slug          TEXT,                          -- DocuSeal signing slug
  status        TEXT NOT NULL DEFAULT 'pending', -- pending, opened, completed, declined
  opened_at     TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  signed_values JSONB,                         -- Field values after signing
  prefilled_fields JSONB,                      -- Fields pre-filled before sending
  last_reminder_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ                    -- soft delete
);

-- Append-only e-signature event log (audit trail)
CREATE TABLE esign_events (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id),
  submission_id BIGINT NOT NULL REFERENCES esign_submissions(id),
  signer_id     BIGINT REFERENCES esign_signers(id), -- NULL for submission-level events
  event_type    TEXT NOT NULL,                 -- created, sent, opened, signed, completed, declined, expired, cancelled, reminder_sent, consent_given, verified, downloaded
  event_data    JSONB,                         -- Event-specific data (field values, error details)
  ip_address    TEXT,
  user_agent    TEXT,
  webhook_event_id TEXT,                       -- DocuSeal webhook event ID (idempotency)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at, NO deleted_at (append-only)
);

-- E-signature consent records
CREATE TABLE esign_consent (
  id            BIGSERIAL PRIMARY KEY,
  community_id  BIGINT NOT NULL REFERENCES communities(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  consent_given BOOLEAN NOT NULL DEFAULT TRUE,
  consent_text  TEXT NOT NULL,                 -- Exact text shown to user
  ip_address    TEXT,
  user_agent    TEXT,
  given_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ                    -- NULL if active
);

-- Indexes
CREATE INDEX idx_esign_templates_community ON esign_templates(community_id);
CREATE INDEX idx_esign_submissions_community ON esign_submissions(community_id);
CREATE INDEX idx_esign_submissions_status ON esign_submissions(community_id, status);
CREATE INDEX idx_esign_signers_submission ON esign_signers(submission_id);
CREATE INDEX idx_esign_signers_user ON esign_signers(user_id);
CREATE INDEX idx_esign_signers_email ON esign_signers(email);
CREATE INDEX idx_esign_events_submission ON esign_events(submission_id);
CREATE INDEX idx_esign_events_webhook ON esign_events(webhook_event_id);
CREATE UNIQUE INDEX idx_esign_consent_active ON esign_consent(community_id, user_id) WHERE revoked_at IS NULL;
```

### Drizzle Schema Location
- File: `packages/db/src/schema/esign.ts`
- Export from `packages/db/src/schema/index.ts`

---

## 13. API Routes

### Route Summary

```
# Template Management (elevated roles)
GET    /api/v1/esign/templates          — List templates
POST   /api/v1/esign/templates          — Create template
GET    /api/v1/esign/templates/:id      — Get template detail
DELETE /api/v1/esign/templates/:id      — Archive template
POST   /api/v1/esign/templates/:id/clone — Clone template

# Signing (submission management)
GET    /api/v1/esign/submissions        — List submissions
POST   /api/v1/esign/submissions        — Create signing request
GET    /api/v1/esign/submissions/:id    — Get submission detail
DELETE /api/v1/esign/submissions/:id    — Cancel submission
GET    /api/v1/esign/submissions/:id/sign — Get signing slug (signer only)
POST   /api/v1/esign/submissions/:id/remind — Send reminder

# Audit & Verification
GET    /api/v1/esign/audit/:submissionId — Get audit trail
POST   /api/v1/esign/verify              — Verify signed PDF

# Builder JWT (server action, not REST)
# JWT generated in server component, not exposed as API route

# Webhook (no session)
POST   /api/v1/webhooks/docuseal        — DocuSeal event handler
```

### Middleware Updates
Add to `apps/web/src/middleware.ts`:
- Protected routes: `/dashboard/esign/*` (requires auth + community membership)
- Token-authenticated: `/api/v1/webhooks/docuseal` (no session, secret header only)
- API routes: `/api/v1/esign/*` (standard auth + tenant scoping)

---

## 14. Environment & Configuration

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DOCUSEAL_API_KEY` | DocuSeal API key (server-only) | Yes |
| `DOCUSEAL_API_URL` | DocuSeal API base URL | Yes |
| `DOCUSEAL_WEBHOOK_SECRET` | Webhook verification secret | Yes |
| `DOCUSEAL_USER_EMAIL` | DocuSeal account admin email | Yes |

### Feature Flag
- Add `esignEnabled` boolean to `communities` table settings JSONB
- Default: `false` (opt-in per community)
- Enables gradual rollout and per-community enablement
- UI hides e-sign nav items when disabled

---

## 15. Testing Strategy

### Unit Tests
- DocuSeal client service: Mock API responses, test error handling
- JWT generation: Verify token structure, TTL, claims
- Webhook handler: Test each event type, idempotency, secret verification
- RBAC: Test permission matrix for esign resource

### Integration Tests
- Template CRUD: Create, list, archive with tenant isolation verification
- Submission lifecycle: Create → sign → complete → document stored
- Webhook processing: Simulate DocuSeal webhook payloads
- Cross-tenant isolation: Verify community A cannot access community B's templates

### E2E Tests
- Template creation flow: Upload document → configure fields → save
- Signing flow: Create submission → sign embedded → verify completion
- Mobile signing: Verify responsive signing experience

---

## 16. Rollout & Migration

### Phase Rollout Plan

| Phase | Scope | Duration Estimate |
|-------|-------|-------------------|
| Phase 1 | Schema, client, config | Foundation |
| Phase 2 | Template CRUD + builder | Template management |
| Phase 3 | Submissions + embedded signing | Core signing flow |
| Phase 4 | Webhooks + audit trail | Event processing |
| Phase 5 | Document storage + compliance | Document integration |
| Phase 6 | Notifications + UX | Polish |
| Phase 7 | Mobile + accessibility | Mobile support |

### Migration Path: Cloud → Self-Hosted
When volume justifies self-hosting:
1. Deploy DocuSeal Docker container with PostgreSQL backend
2. Update `DOCUSEAL_API_URL` to self-hosted instance
3. Migrate templates via DocuSeal clone API
4. Update webhook URLs
5. No schema changes needed (same API interface)

### Demo Seeding
Extend `scripts/seed-demo.ts`:
- Create 2-3 e-sign templates per demo community
- Create sample submissions in various states (pending, completed, expired)
- Populate audit events for completed submissions

---

## Appendix A: File Structure (New Files)

```
packages/db/src/schema/esign.ts                          — Drizzle schema
packages/db/migrations/XXXX_add_esign_tables.sql          — Migration

apps/web/src/lib/services/docuseal-client.ts              — DocuSeal API wrapper
apps/web/src/lib/services/docuseal-jwt.ts                 — JWT generation
apps/web/src/lib/services/esign-service.ts                — Business logic orchestrator

apps/web/src/app/api/v1/esign/templates/route.ts          — Template CRUD
apps/web/src/app/api/v1/esign/templates/[id]/route.ts     — Template detail
apps/web/src/app/api/v1/esign/templates/[id]/clone/route.ts
apps/web/src/app/api/v1/esign/submissions/route.ts        — Submission CRUD
apps/web/src/app/api/v1/esign/submissions/[id]/route.ts   — Submission detail
apps/web/src/app/api/v1/esign/submissions/[id]/sign/route.ts
apps/web/src/app/api/v1/esign/submissions/[id]/remind/route.ts
apps/web/src/app/api/v1/esign/audit/[submissionId]/route.ts
apps/web/src/app/api/v1/esign/verify/route.ts
apps/web/src/app/api/v1/webhooks/docuseal/route.ts

apps/web/src/app/(authenticated)/dashboard/esign/page.tsx           — E-sign dashboard
apps/web/src/app/(authenticated)/dashboard/esign/templates/page.tsx — Template list
apps/web/src/app/(authenticated)/dashboard/esign/templates/new/page.tsx
apps/web/src/app/(authenticated)/dashboard/esign/sign/[id]/page.tsx — Signing page

apps/web/src/app/mobile/esign/page.tsx                    — Mobile dashboard
apps/web/src/app/mobile/esign/sign/[id]/page.tsx          — Mobile signing

apps/web/src/components/esign/EsignForm.tsx               — DocusealForm wrapper
apps/web/src/components/esign/EsignBuilder.tsx            — DocusealBuilder wrapper
apps/web/src/components/esign/EsignStatusBadge.tsx        — Status indicator
apps/web/src/components/esign/EsignConsentDialog.tsx      — UETA consent
apps/web/src/components/esign/PendingSignaturesWidget.tsx — Dashboard widget

packages/email/src/templates/EsignRequestEmail.tsx
packages/email/src/templates/EsignReminderEmail.tsx
packages/email/src/templates/EsignCompletedEmail.tsx

packages/shared/src/esign-constants.ts                    — Shared types & constants
```

## Appendix B: Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| DocuSeal Cloud outage | Signed PDFs always copied to Supabase Storage; status tracked locally |
| API key compromise | Key stored server-only; rotatable via DocuSeal console; monitor for unauthorized usage |
| Webhook delivery failure | Idempotent processing; manual sync endpoint for reconciliation |
| Cross-tenant data leak | `createScopedClient()` enforces tenant isolation; `external_id` includes `communityId` |
| AGPL license concerns | Using cloud API (no source distribution); self-hosted would require AGPL compliance review |
| Per-document costs at scale | Migration path to self-hosted DocuSeal documented; monitor spend |
| Signer disputes | Full audit trail with IP, timestamp, consent record; DocuSeal Certificate of Signature |

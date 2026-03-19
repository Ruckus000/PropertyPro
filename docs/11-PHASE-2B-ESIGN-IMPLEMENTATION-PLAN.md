# Phase 2B: Native E-Sign Tool — Implementation Plan

**Date:** March 18, 2026
**Status:** Plan (pre-implementation)
**Source:** [09-IMPLEMENTATION-ROADMAP-2026-03-16.md](09-IMPLEMENTATION-ROADMAP-2026-03-16.md) lines 373-408
**Revision:** v3 — incorporates architecture audit (v2), UX review (v2→v3 addendum), and two bug fixes (§2.1 URL-safe tokens, §2.2 external signer consent).

---

## 0. Audit Notes (v1 → v2 Changes)

v1 was spec-complete but implementation-naive. These issues were identified and corrected:

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| A1 | **Over-decomposed services** — 4 service files for a single feature. `esign-token-service.ts` and `esign-consent-service.ts` are thin wrappers around 2-3 DB ops each. | High | Merge token + consent logic into main `esign-service.ts`. Keep `esign-pdf-service.ts` separate (genuinely different concern: binary manipulation). **2 services, not 4.** |
| A2 | **Signing flow UX has 5 steps** — consent → review → fill → review → submit. Every step loses signers. DocuSign/HelloSign solve this in 2 steps. | High | Redesigned to single-page flow: document displayed with highlighted fields, consent checkbox inline at bottom, click field → capture modal → fills inline. "Finish" button when all required fields done. **1 page, not 5 steps.** |
| A3 | **`signing_token` column duplicates `slug`** — schema already has `slug` (text, nullable) on `esign_signers`. Plan added a redundant `signing_token` column. | Medium | Use `slug` as the signing token. Populate it with an encrypted value at signer creation. **No new column needed.** |
| A4 | **Audit certificate PDF is scope creep** — generating a styled PDF from scratch with pdf-lib requires manual text layout (no CSS, no rich formatting). Tedious and low-value when the same data is viewable in the UI. | Medium | Defer audit certificate PDF to post-ship. The `esign_events` audit trail is viewable on the submission detail page and exportable as JSON/CSV. |
| A5 | **Native pointer events for drag-and-drop is undercooked** — missing: touch handling, scroll-during-drag, boundary constraints, resize handles, keyboard accessibility (WCAG), snap-to-grid. | High | Use `@dnd-kit/core` + `@dnd-kit/utilities` (~15KB gzipped). Handles accessibility, touch, keyboard, sensors, collision detection. shadcn's sortable examples use this. |
| A6 | **Template builder wizard is 4 steps when it should be 2** — upload + name + type + roles should be one step. Field placement is the second. "Review & save" is a button, not a step. | Medium | Collapsed to 2 phases: (1) Setup (upload PDF, name, type, define roles), (2) Editor (place fields, save). |
| A7 | **Dashboard landing page (G4) is premature** — summary cards and activity feeds are useful at scale. At launch, you have 0 submissions. | Low | Cut. E-Sign section opens to submissions list with "New" button. Templates accessible via tab or subnav. |
| A8 | **No signature reuse** — if a signer has 4 signature fields, they should draw once and auto-fill the rest. | Medium | Added: first signature captured is reused for subsequent signature fields (with option to re-draw individual). |
| A9 | **Missing pdfjs-dist worker config** — pdfjs-dist requires a web worker. In Next.js, `GlobalWorkerOptions.workerSrc` must be set correctly or PDF rendering silently fails. | Medium | Added explicit worker configuration step in Track A. |
| A10 | **Percentage coordinates lack reference frame** — PDF pages have MediaBox, CropBox, BleedBox. Which box do percentages reference? | Medium | Specified: percentages are relative to the `pdfjs-dist` rendered viewport (which uses CropBox). The PDF service translates these to absolute points relative to MediaBox when embedding signatures. |
| A11 | **Consent as a standalone subsystem** — dedicated routes, hooks, and service for what amounts to a checkbox. UETA consent should be captured inline during signing, not as a pre-flight ceremony. | Medium | Consent captured as part of the signature submission POST. Consent record created server-side as a side effect. Standalone consent management moved to account settings (not a separate Track). |
| A12 | **32 new files is too many** — `signing-field-highlighter.tsx` is a behavior, not a component. `signing-complete.tsx` is a conditional render. Several "components" should be composed from primitives. | Low | Reduced to 25 new files. Merged highlighter into field overlay. Merged completion view into signing page. |
| A13 | **No error/loading/empty states specified** — a Vercel-quality implementation specs these explicitly. | Medium | Added to each UI component specification. |
| A14 | **`signing_order` + `sort_order` columns add v1 complexity** — sequential signing is a power feature. Parallel signing covers 90%+ of HOA use cases (everyone signs the same form). | Low | Kept. The schema columns are cheap. The service logic is a single `if` check. The UI is a toggle. Low cost, meaningful capability for multi-party documents like proxy forms. |

---

## 1. Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| `esign_templates` table | Exists | `docuseal_template_id` is `NOT NULL` — must make nullable for native templates |
| `esign_submissions` table | Exists | Full status workflow (pending/completed/declined/expired/cancelled), linked_document_id FK to documents |
| `esign_signers` table | Exists | Per-signer status tracking, `signed_values` JSONB, reminder tracking, `slug` field (to be used as signing token) |
| `esign_events` table | Exists | Append-only audit trail — no updated_at, no deleted_at |
| `esign_consent` table | Exists | UETA/ESIGN Act compliance, unique active consent per user per community |
| RLS policies | Exists | Admin-write for templates/submissions/signers, append-only for events, user-scoped consent (migrations 0090 + 0096) |
| Feature flag (`hasEsign`) | Exists | Defined in `CommunityFeatures` interface |
| Shared constants | Exists | Template types, statuses, event types, elevated roles, consent text, reminder limits in `packages/shared/src/esign-constants.ts` |
| Audit actions | Exists | 8 e-sign actions registered in `packages/db/src/utils/audit-logger.ts` |
| API routes | **Not started** | No `/api/v1/esign/` directory |
| Service layer | **Not started** | No `esign-service.ts` |
| UI components | **Not started** | No `apps/web/src/components/esign/` directory |
| TanStack Query hooks | **Not started** | No `useEsign*.ts` hooks |
| Email templates | **Not started** | No e-sign email templates |
| PDF libraries | **Not installed** | No `pdf-lib`, `pdfjs-dist`, `signature_pad`, or `@dnd-kit` in dependencies |

### Key Codebase Gaps Identified

1. **`docusealTemplateId` is `NOT NULL`** — must make nullable. Native templates have no DocuSeal ID.
2. **No signing order columns** — `esign_submissions` needs `signing_order`, `esign_signers` needs `sort_order` for sequential signing.
3. **No document hash column** — `esign_submissions` needs `document_hash` for tamper evidence.
4. **No field type definitions** — `ESIGN_FIELD_TYPES` not defined in shared constants.
5. **`slug` field on `esign_signers` is nullable** — needs to be populated with encrypted signing token at creation.

---

## 2. Resolved Decisions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | PDF manipulation library? | **`pdf-lib`** (server + browser) | Lightweight (270KB), pure JS, works in Node.js and browser. No native deps. Handles signature embedding and PDF flattening. MIT licensed. |
| 2 | PDF rendering in browser? | **`pdfjs-dist`** (Mozilla pdf.js) | Industry standard. Renders pages to canvas for template builder overlay. Requires explicit worker configuration in Next.js. |
| 3 | Signature capture? | **`signature_pad`** npm package | 12KB, zero-dependency, smooth drawing with pressure sensitivity. Type/upload modes handled separately. |
| 4 | Template field placement UI? | **`@dnd-kit/core` over pdf.js canvas** | Handles accessibility (keyboard), touch devices, scroll-during-drag, collision detection, boundary constraints. ~15KB gzipped. Raw pointer events would miss WCAG compliance and have edge case bugs on mobile. |
| 5 | Signing link security? | **Opaque random token stored in `slug` field** | Reuse existing `slug` column on `esign_signers`. Populated with a 64-char hex string (`crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')`) — same pattern as invitations. URL: `/sign/{submissionExternalId}/{slug}`. Validated via DB lookup + signer status check. See §2.1 for full rationale. |
| 6 | PDF flattening? | **Server-side via `pdf-lib` after all signers complete** | Load source PDF → embed signatures at stored coordinates → flatten → compute SHA-256 hash → upload to Storage. |
| 7 | Audit certificate? | **Defer PDF. Ship UI-based audit trail + JSON export.** | pdf-lib has no text layout engine. Manual PDF generation is tedious. The `esign_events` table provides the same data, viewable on the submission detail page. PDF cert added post-ship. |
| 8 | Signing order? | **Optional sequential via `sort_order` field** | Signer with `sort_order=1` blocked until `sort_order=0` complete. Same `sort_order` = parallel. Cheap to implement, meaningful for proxy forms and multi-party documents. |
| 9 | Pre-built templates? | **Proxy form + violation ack + custom** | Ship 2 pre-built templates with JSON field definitions. Others added incrementally. |
| 10 | UETA consent flow? | **Inline during signing, not a separate step** | Consent checkbox at bottom of signing page alongside "Finish" button. Consent recorded server-side when signature is submitted. **Dual-path storage:** PropertyPro users → `esign_consent` table (per-community, revocable). External signers (no userId) → `esign_events` with `consent_given` event only (append-only, per-signing). See §2.2 for full rationale. |
| 11 | Coordinate system? | **Percentages relative to pdfjs-dist rendered viewport** | pdfjs-dist renders the CropBox. Percentages are relative to the canvas dimensions at scale=1. PDF service translates to absolute MediaBox points when embedding. This isolates the UI from PDF internals. |
| 12 | Signature reuse? | **First capture reused for subsequent fields** | When signer draws/types signature, it's cached client-side. Subsequent signature fields auto-fill with the cached value. Signer can re-draw any individual field. Initials cached separately. |

### 2.1 Bug Fix: Signing Token is Not URL-Safe (v3 fix)

**Problem:** The v2 plan stored an AES-256-GCM encrypted payload in the `slug` field and placed it directly in the URL path (`/sign/{submissionExternalId}/{slug}`). The `encryptToken()` function in `packages/db/src/crypto/token-encryption.ts:59` outputs **standard base64**, which contains `+`, `/`, and `=`. These characters break URL path segments — Next.js will mis-parse `/` as a path separator, splitting the slug across route segments.

**Investigation findings:**
- No `base64url` utility exists anywhere in the codebase.
- The invitation system uses plain hex UUIDs (`crypto.randomUUID().replace(/-/g, '')`) — URL-safe by construction, validated via DB lookup.
- The `encryptToken`/`decryptToken` functions are used by calendar-sync and accounting-connectors for **stored tokens** (never in URLs), so changing their encoding would be a breaking change to those features.
- The `slug` field on `esign_signers` is completely unused — no code reads or writes it.

**Options evaluated:**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Add `base64url` encoding wrapper to `token-encryption.ts` | Self-verifying token (rejects garbage without DB hit) | New utility code, `+`/`/`/`=` conversion, must not break existing callers, still needs DB lookup anyway for status check |
| B | Use query params instead of path segments (`/sign?id=X&slug=Y`) | `encodeURIComponent` handles encoding automatically | Ugly URLs, doesn't match the clean `/sign/[id]/[slug]` route pattern, query params are more easily stripped by proxies/email clients |
| **C** | **Opaque random hex token (same as invitations)** | **URL-safe by construction (hex chars only), proven pattern in codebase, zero new dependencies, simplest implementation** | **Not self-verifying (requires DB lookup) — but you need the DB lookup anyway to load signer context** |

**Decision: Option C.** Generate slug as `crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')` — a 64-character hex string. This is identical to how invitations work, which has been in production without issues.

**Why not encryption?** Encryption would let us reject invalid tokens without a database hit. But the signing endpoint *always* needs a DB query regardless — it loads the signer record, submission, template fields, and PDF URL. The "skip the DB on garbage input" benefit saves one query on attack traffic, which the rate limiter (10 req/min/IP) already handles. Encryption adds complexity (key management, encoding conversion, base64url wrapper) for zero user-facing benefit.

**Security model:**
- 256 bits of entropy (two UUIDs concatenated) — computationally infeasible to guess
- Validated server-side: slug must exist in DB, signer status must be `pending` or `opened`, submission must not be expired/cancelled
- Rate limited: 10 req/min/IP on signing endpoints
- Single-use by status: once a signer completes or declines, the slug is dead (status is no longer `pending`/`opened`)

**Implementation:**
```typescript
// In esign-service.ts createSubmission():
const slug = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
// Store in esign_signers.slug
// Build URL: `${baseUrl}/sign/${submission.externalId}/${slug}`
```

**Files affected:** `apps/web/src/lib/services/esign-service.ts` (the only file that generates slugs). No changes to `token-encryption.ts`.

---

### 2.2 Bug Fix: `esign_consent` Table Rejects External Signers (v3 fix)

**Problem:** The `esign_consent` table has `userId uuid NOT NULL REFERENCES auth.users(id)`. External signers (attorneys, proxy holders, vendors — anyone who isn't a PropertyPro user) have no `userId`. The `esign_signers.userId` is nullable for exactly this reason, but the consent table wasn't designed with the same consideration.

Additionally, the RLS policy on `esign_consent` (migration 0096) checks `user_id = auth.uid()`. External signers have no Supabase session, so `auth.uid()` is NULL — they'd be blocked even with the admin client if row-level checks were enforced on reads.

**Investigation findings:**
- The `esign_events` table already has event types `consent_given` and `consent_revoked`.
- `esign_events` is append-only (no `updated_at`, no `deleted_at`) — it's actually *more* tamper-evident than the consent table (which supports `revokedAt` updates).
- `esign_events` links via `signer_id` (FK to `esign_signers`), which stores the signer's email, name, IP, and user agent — all the data UETA requires.
- UETA (Florida §668.50) and the federal ESIGN Act require: (1) consent given before signing, (2) evidence of consent (timestamp, identity, text agreed to). They do **not** require a user account.

**Options evaluated:**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Migrate: make `userId` nullable, add `signerId` FK | Single table for all consent records | Schema migration, new unique constraint complexity (partial index on nullable columns), adds a column that's only populated for one user type |
| **B** | **Dual-path: `esign_consent` for users, `esign_events` for external signers** | **No schema changes, leverages append-only auditability, each path optimized for its use case** | **Two code paths (branching logic in service)** |
| C | Drop `esign_consent` entirely, use only `esign_events` | Simplest, one code path | Loses per-community consent revocation for PropertyPro users (UETA requires revocation mechanism for users who have accounts) |

**Decision: Option B.** The two user types have fundamentally different consent lifecycles:

| | PropertyPro User | External Signer |
|---|---|---|
| **Has account?** | Yes | No |
| **Signs repeatedly?** | Yes (multiple documents over time) | No (one document, done) |
| **Can revoke consent?** | Yes (UETA requires it for account holders) | No (no account to revoke from) |
| **Consent scope** | Per-community (one consent covers future signings) | Per-signing-event |
| **Storage** | `esign_consent` table (revocable, per-community unique index) | `esign_events` with `consent_given` event (append-only, per-signing) |

This is not a workaround — it's the correct model. A per-community revocable consent record doesn't make sense for someone who signs one document and never returns. An append-only event log is the right structure for "this person agreed to this text at this time."

**Implementation (in `esign-service.ts` `submitSignature`):**

```typescript
// After validating signature data and consent checkbox...

if (signer.userId) {
  // PropertyPro user: upsert esign_consent (skip if active consent already exists)
  const existing = await getActiveConsent(communityId, signer.userId);
  if (!existing) {
    await insertConsent(communityId, signer.userId, consentText, ipAddress, userAgent);
  }
}

// ALL signers (internal and external): log consent event in append-only audit trail
await insertEsignEvent({
  communityId,
  submissionId,
  signerId: signer.id,
  eventType: 'consent_given',
  eventData: { consentText: ESIGN_CONSENT_TEXT },
  ipAddress,
  userAgent,
});
```

**Legal coverage:** Every signer — regardless of account status — has a tamper-evident `consent_given` event in `esign_events` with full provenance (IP, user agent, timestamp, consent text, signer identity via `signer_id` → email/name). PropertyPro users additionally have a revocable record in `esign_consent` that applies to future signings.

**Files affected:** `apps/web/src/lib/services/esign-service.ts` only. No schema migration needed.

---

## 3. Schema Migration

### 3.1 Migration: `0100_esign_native_template_support.sql`

```sql
-- Make docuseal_template_id nullable for native templates
ALTER TABLE "public"."esign_templates"
  ALTER COLUMN "docuseal_template_id" DROP NOT NULL;

--> statement-breakpoint

-- Add signing order to submissions (parallel or sequential)
ALTER TABLE "public"."esign_submissions"
  ADD COLUMN IF NOT EXISTS "signing_order" text NOT NULL DEFAULT 'parallel';

--> statement-breakpoint

-- Add document hash for tamper-evident storage
ALTER TABLE "public"."esign_submissions"
  ADD COLUMN IF NOT EXISTS "document_hash" text;

--> statement-breakpoint

-- Add sort_order to signers for sequential signing
ALTER TABLE "public"."esign_signers"
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

--> statement-breakpoint

-- Index for fast slug lookup during signing (slug used as signing token)
CREATE INDEX IF NOT EXISTS "idx_esign_signers_slug"
  ON "public"."esign_signers" ("slug") WHERE "deleted_at" IS NULL;
```

**Drizzle schema updates** (`packages/db/src/schema/esign.ts`):
```typescript
// esign_templates: remove .notNull() from docusealTemplateId
docusealTemplateId: integer('docuseal_template_id'),

// esign_submissions: add columns
signingOrder: text('signing_order').notNull().default('parallel'),
documentHash: text('document_hash'),

// esign_signers: add column
sortOrder: integer('sort_order').notNull().default(0),
```

**Note:** No `signing_token` column. The existing `slug` field is repurposed to hold the encrypted signing token. It's already `text`, nullable, and has no unique constraint that would conflict.

---

## 4. Implementation Tasks — Dependency-Ordered

### Track A: Foundation & Dependencies (prerequisite for all work)

#### A1. Install npm dependencies
**Files:** `apps/web/package.json`

```
pdf-lib          — PDF manipulation (server + browser)
pdfjs-dist       — PDF rendering in browser
signature_pad    — Signature capture canvas
@dnd-kit/core    — Drag-and-drop primitives (accessible, touch-ready)
@dnd-kit/utilities — DnD utility helpers
```

#### A2. Configure pdfjs-dist worker
**Files:** Create `apps/web/src/lib/esign/pdf-worker-config.ts`

pdfjs-dist requires a web worker. This is a common Next.js gotcha — without explicit configuration, PDF rendering silently fails.

```typescript
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Point to the worker bundled with pdfjs-dist.
// In Next.js, this needs to be a static import or a CDN URL.
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

This must be imported once before any pdfjs-dist usage (e.g., at the top of the PDF viewer component).

#### A3. Apply schema migration
**Files:** `packages/db/migrations/0100_esign_native_template_support.sql`, `packages/db/src/schema/esign.ts`

**Verification:** `docusealTemplateId` accepts null; `signingOrder`, `documentHash`, `sortOrder` columns exist.

#### A4. Extend shared constants
**Files:** `packages/shared/src/esign-constants.ts`

```typescript
export const ESIGN_SIGNING_ORDERS = ['parallel', 'sequential'] as const;
export const ESIGN_FIELD_TYPES = ['signature', 'initials', 'date', 'text', 'checkbox'] as const;
export type EsignFieldType = (typeof ESIGN_FIELD_TYPES)[number];

/** A single placeable field on a PDF template page. */
export interface EsignFieldDefinition {
  id: string;               // client-generated UUID
  type: EsignFieldType;
  signerRole: string;        // which signer fills this field
  page: number;              // 0-indexed page number
  /** All position/size values are percentages (0-100) relative to the
   *  pdfjs-dist rendered viewport at scale=1 (CropBox).
   *  The PDF service translates to absolute MediaBox points when embedding. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
}

export interface EsignFieldsSchema {
  version: 1;
  fields: EsignFieldDefinition[];
  signerRoles: string[];
}
```

---

### Track B: Service Layer (Days 2-5)

#### B1. Core e-sign service
**Files:** Create `apps/web/src/lib/services/esign-service.ts`

Pattern: Follow `violations-service.ts` — typed interfaces, `createScopedClient`, `logAuditEvent`.

This is the **single service file** for all e-sign business logic, including token generation and consent recording (previously split across 3 files).

**Key interfaces:**
```typescript
export interface CreateTemplateInput {
  name: string;
  description?: string;
  templateType: EsignTemplateType;
  sourceDocumentPath: string;
  fieldsSchema: EsignFieldsSchema;
}

export interface CreateSubmissionInput {
  templateId: number;
  signers: Array<{
    email: string;
    name: string;
    role: string;      // must match a signerRole from the template
    sortOrder: number;  // 0 = first group, 1 = second, etc.
    userId?: string;
    prefilledFields?: Record<string, unknown>;
  }>;
  signingOrder: 'parallel' | 'sequential';
  sendEmail: boolean;
  expiresAt?: string;
  messageSubject?: string;
  messageBody?: string;
  linkedDocumentId?: number;
}

export interface SubmitSignatureInput {
  signedValues: Record<string, {
    fieldId: string;
    type: EsignFieldType;
    value: string;       // base64 PNG for signature/initials, text for date/text/checkbox
    signedAt: string;    // ISO timestamp
  }>;
  consentGiven: true;    // enforced at Zod level
}
```

**Functions (grouped by domain):**

*Template management:*
- `createTemplate(communityId, userId, input)` — creates record, generates `external_id` via `crypto.randomUUID()`
- `listTemplates(communityId, filters?)` — status/type filters, includes field count
- `getTemplate(communityId, templateId)` — with `fields_schema`
- `updateTemplate(communityId, userId, templateId, input)` — update name/description/fields_schema
- `archiveTemplate(communityId, userId, templateId)` — set status 'archived', audit log
- `cloneTemplate(communityId, userId, templateId, newName)` — deep copy with new external_id

*Submission lifecycle:*
- `createSubmission(communityId, userId, input)` — creates submission + signer records. For each signer: generates slug via `crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'')` (64-char hex, URL-safe), sends invitation email if `sendEmail=true`. Logs `esign_submission_created` + `esign_events` 'created' entry.
- `listSubmissions(communityId, filters?)` — with signer progress counts (completed/total)
- `getSubmission(communityId, submissionId)` — with signers and events
- `cancelSubmission(communityId, userId, submissionId)` — set status 'cancelled', audit log
- `sendReminder(communityId, userId, signerId)` — validates `reminderCount < ESIGN_MAX_REMINDERS`, increments, sends email, logs event

*Signing flow (token-authenticated, no community scope):*
- `getSignerContext(slug)` — looks up signer by slug (indexed), validates status is `pending`|`opened`, returns signer + submission + template fields_schema + source PDF URL. Marks signer as `opened` if first access. Uses admin client (external signers have no session — see §8 security notes).
- `submitSignature(slug, input, ipAddress, userAgent)` — validates all required fields present, stores `signed_values` on signer. Consent handling (§2.2): if signer has `userId` → upsert `esign_consent`; always log `consent_given` event in `esign_events`. Marks signer `completed`, logs events. Then calls `checkAndCompleteSubmission`.
- `declineSigning(slug, reason?)` — marks signer `declined`, logs event, marks submission `declined` if any signer declines.

*Completion (internal):*
- `checkAndCompleteSubmission(submissionId)` — if all signers completed: calls PDF service to flatten, computes hash, updates submission status to `completed`, sends completion email to creator.

*Consent (lightweight — no separate service):*
- `getConsentStatus(communityId, userId)` — check for active `esign_consent` record
- `revokeConsent(communityId, userId)` — set `revokedAt`, audit log

#### B2. PDF service (server-side)
**Files:** Create `apps/web/src/lib/services/esign-pdf-service.ts`

Separated because it handles binary data, has different dependencies (`pdf-lib`, Node.js `crypto`), and runs exclusively server-side.

```typescript
/**
 * Coordinate translation: The UI stores field positions as percentages
 * of the pdfjs-dist viewport (CropBox at scale=1). This service translates
 * to absolute points in the PDF's coordinate system (MediaBox, origin at
 * bottom-left, 72 points per inch).
 *
 * Translation formula:
 *   pdfX = (field.x / 100) * page.width
 *   pdfY = page.height - ((field.y / 100) * page.height) - fieldHeightPts
 *   (Y is inverted: PDF origin is bottom-left, UI origin is top-left)
 */
```

- `flattenSignedPdf(sourceDocumentPath, signers, fieldsSchema)` — downloads source PDF from Supabase Storage, embeds each signer's signature/initials as PNG images at computed coordinates, fills date/text fields as text, returns `Uint8Array` of flattened PDF
- `computeDocumentHash(pdfBytes: Uint8Array): string` — SHA-256 hex via Node.js `crypto.createHash`
- `uploadSignedDocument(communityId, submissionId, pdfBytes, fileName)` — uploads to `communities/{communityId}/esign-signed/{submissionId}/{fileName}`, returns storage path

**Note:** `generateAuditCertificate` is **deferred**. Audit trail is served via the UI (submission detail page) and exportable as JSON.

---

### Track C: API Routes (Days 4-7)

Route structure follows existing codebase conventions (violations/ARC pattern: separate route files for distinct actions).

All authenticated routes use: `withErrorHandler`, `requireAuthenticatedUserId`, `requireCommunityMembership`, `resolveEffectiveCommunityId`, `requirePermission(membership, 'esign', ...)`.

#### C1. Template routes
- `apps/web/src/app/api/v1/esign/templates/route.ts`
  - `GET` — list templates (read permission). Query params: `?status=active|archived`, `?type=proxy|custom|...`
  - `POST` — create template (write permission)
- `apps/web/src/app/api/v1/esign/templates/[id]/route.ts`
  - `GET` — template detail with `fields_schema` (read)
  - `PATCH` — update name/description/fields_schema (write)
  - `DELETE` — archive (soft) (write)
- `apps/web/src/app/api/v1/esign/templates/[id]/clone/route.ts`
  - `POST` — clone template (write). Separate route because it returns a new resource.

#### C2. Submission routes
- `apps/web/src/app/api/v1/esign/submissions/route.ts`
  - `GET` — list with signer progress counts (read). Query params: `?status=pending|completed|...`
  - `POST` — create submission + signers + send invitations (write)
- `apps/web/src/app/api/v1/esign/submissions/[id]/route.ts`
  - `GET` — detail with signers + events timeline (read)
- `apps/web/src/app/api/v1/esign/submissions/[id]/cancel/route.ts`
  - `POST` — cancel submission (write)
- `apps/web/src/app/api/v1/esign/submissions/[id]/remind/route.ts`
  - `POST` — send reminder to pending signers (write). Body: `{ signerId?: number }` (specific signer or all pending).
- `apps/web/src/app/api/v1/esign/submissions/[id]/download/route.ts`
  - `GET` — presigned download URL for signed PDF (read). Query: `?type=signed|source|audit_json`

#### C3. Signing routes (token-authenticated, no session)
- `apps/web/src/app/api/v1/esign/sign/[submissionExternalId]/[slug]/route.ts`
  - `GET` — validate token, return: signer info, template fields for this signer's role, source PDF presigned URL, submission metadata (name, expires_at). **Does not return** other signers' info or community details.
  - `POST` — submit signature data. Body includes `signedValues` + `consentGiven: true`. Server injects IP + user agent. Creates `esign_consent` record as side effect.
- **Must be added to middleware token-authenticated route allowlist**

#### C4. Consent management (lightweight, in account settings)
- `apps/web/src/app/api/v1/esign/consent/route.ts`
  - `GET` — current user's consent status (read)
  - `DELETE` — revoke consent (write)

**Note:** `POST` (give consent) is not a standalone route. Consent is captured inline during signature submission (C3 POST). This route only handles viewing and revoking.

---

### Track D: Email Templates (Days 5-6)

#### D1. Signing invitation email
**Files:** Create `packages/email/src/templates/esign-invitation-email.tsx`

Props: `signerName`, `senderName`, `communityName`, `documentName`, `signingUrl`, `expiresAt`, `messageBody?`
Pattern: Follow `invitation-email.tsx`. CTA button: "Review & Sign Document".

#### D2. Signing completed email
**Files:** Create `packages/email/src/templates/esign-completed-email.tsx`

Props: `senderName`, `communityName`, `documentName`, `completedAt`, `signerCount`
Sent to submission creator when all signers complete.

#### D3. Signing reminder email
**Files:** Create `packages/email/src/templates/esign-reminder-email.tsx`

Props: `signerName`, `documentName`, `signingUrl`, `reminderNumber`, `expiresAt`

#### D4. Update barrel exports
**Files:** `packages/email/src/index.ts`

---

### Track E: Template Builder UI (Days 6-12)

#### E1. PDF Viewer component (reusable)
**Files:** Create `apps/web/src/components/esign/pdf-viewer.tsx`

Renders PDF pages via `pdfjs-dist` to `<canvas>`. This component is reused by both the template builder (editable mode) and the signing page (read-only mode).

```typescript
interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onDocumentLoad: (meta: { totalPages: number; pageDimensions: Array<{ width: number; height: number }> }) => void;
  scale?: number;          // default 1.0
  className?: string;
  children?: React.ReactNode;  // overlay slot (field markers, signing highlights)
}
```

**States:**
- Loading: skeleton placeholder matching page aspect ratio
- Error: retry button with "Failed to load document" message
- Loaded: canvas with page navigation (prev/next + page indicator)

**Technical notes:**
- Worker configured via `pdf-worker-config.ts` import at module top
- Canvas sized to `page.getViewport({ scale }).width/height`
- HiDPI: multiply canvas dimensions by `devicePixelRatio`, scale down via CSS
- `children` slot renders absolutely positioned over the canvas for field overlays

Design tokens: `var(--surface-subtle)` background, page nav with `Button` ghost variant, page indicator in `text-[var(--text-secondary)]`.

#### E2. Field overlay component
**Files:** Create `apps/web/src/components/esign/field-overlay.tsx`

Renders field markers over the PDF canvas using `@dnd-kit`. Supports two modes: **edit** (template builder) and **view** (signing page, submission detail).

```typescript
interface FieldOverlayProps {
  fields: EsignFieldDefinition[];
  pageDimensions: { width: number; height: number };
  currentPage: number;
  mode: 'edit' | 'view' | 'sign';
  selectedFieldId?: string | null;
  onFieldSelect?: (fieldId: string) => void;
  onFieldUpdate?: (fieldId: string, update: Partial<Pick<EsignFieldDefinition, 'x' | 'y' | 'width' | 'height'>>) => void;
  onFieldRemove?: (fieldId: string) => void;
  /** In 'sign' mode: which fields have been filled */
  filledFieldIds?: Set<string>;
  /** In 'sign' mode: click handler to open capture modal */
  onFieldClick?: (field: EsignFieldDefinition) => void;
  signerRoleColors: Record<string, string>;
}
```

**Edit mode (template builder):**
- Fields are draggable via `@dnd-kit` `useDraggable`
- Corner resize handles on selected field
- Boundary constraints: fields cannot exceed page bounds
- Keyboard: arrow keys nudge selected field by 1%, delete removes
- Snap: optional grid snap (Shift held = free movement)

**View mode (submission detail):**
- Fields rendered as static badges showing type icon + role label

**Sign mode (signing page):**
- Unfilled required fields: pulsing `ring-2 ring-[var(--border-error)]` with `animate-pulse`
- Filled fields: `ring-2 ring-[var(--status-success)]` with checkmark overlay
- Click on unfilled field opens signature capture modal
- Auto-scroll to next unfilled field after each capture

Color mapping for signer roles:
```typescript
const ROLE_COLORS = [
  'var(--interactive-primary)',   // blue
  'hsl(142, 71%, 45%)',          // green
  'hsl(271, 91%, 65%)',          // purple
  'hsl(25, 95%, 53%)',           // orange
] as const;
```

#### E3. Field palette / toolbar
**Files:** Create `apps/web/src/components/esign/field-palette.tsx`

Sidebar in template builder. Click a field type → click on PDF to place at that position.

```typescript
interface FieldPaletteProps {
  signerRoles: string[];
  activeRole: string;
  onRoleChange: (role: string) => void;
  activeFieldType: EsignFieldType | null;
  onFieldTypeSelect: (type: EsignFieldType | null) => void;
  fieldCounts: Record<string, number>;  // role → count of placed fields
}
```

- Role selector: tabs, color-coded to match overlay markers
- Field type buttons: icon + label, one active at a time (click to toggle)
  - Signature (`PenTool`), Initials (`Type`), Date (`Calendar`), Text (`TextCursorInput`), Checkbox (`CheckSquare`)
- Field count per role shown as badge
- "Click on the document to place a field" instruction text when a type is active

Design tokens: `Card`, `var(--surface-card)`, `var(--border-subtle)` dividers.

#### E4. Template builder page
**Files:** Create `apps/web/src/app/(authenticated)/esign/templates/new/page.tsx`

**Two-phase flow (not a multi-step wizard):**

**Phase 1 — Setup (left panel):**
- Template name (text input, required)
- Template type (select: proxy, consent, violation_ack, custom, etc.)
- Description (textarea, optional)
- Upload PDF: drop zone or click to browse. Uses presigned upload to `communities/{communityId}/esign-templates/{uuid}/{safeFileName}`. Shows upload progress bar.
- Signer roles: dynamic list. "Add role" button. Each role has a name input + color swatch. Min 1 role.
- "Continue to Editor" button (disabled until PDF uploaded + at least 1 role defined)

**Phase 2 — Field Editor (full-width):**
- Left sidebar: `FieldPalette`
- Center: `PdfViewer` with `FieldOverlay` in edit mode
- Bottom bar (sticky): "Save Template" primary button, field count summary, "Back to Setup" ghost button
- Right panel (on field select): field properties — type, role assignment, required toggle, label input

**States:**
- Empty: "Upload a PDF to get started" centered message
- Loading: skeleton
- Saving: button loading state, disable interactions

Server component validates auth + community membership, resolves community timezone, renders client shell.

#### E5. Templates page (list + detail combined)
**Files:** Create `apps/web/src/app/(authenticated)/esign/templates/page.tsx`

- Table view: name, type badge, signer role count, field count, status badge, created date, actions dropdown (edit, clone, archive)
- Row click → expand detail inline OR navigate to `/esign/templates/[id]` (detail page with read-only PDF preview + field overlay + "Send for Signing" CTA + "Edit Fields" button)
- "Create Template" primary button in page header
- Empty state: illustration + "Create your first e-sign template" + CTA

**Files:** Create `apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx`

- Read-only PDF preview with `FieldOverlay` in view mode
- Metadata panel: name, type, roles, field count, created by, created date
- "Send for Signing" primary CTA → navigates to submission creation with template pre-selected
- Action bar: "Edit Fields" → navigate to builder with template loaded, "Clone", "Archive"

---

### Track F: Signing Flow UI (Days 10-16)

#### F1. Signing page (public, token-authenticated)
**Files:** Create `apps/web/src/app/sign/[submissionExternalId]/[slug]/page.tsx`

**Public route** — not under `(authenticated)`, no Supabase session required.

**Single-page flow (not a multi-step wizard):**

Layout: Clean, minimal. Community name in header. No sidebar, no nav. Branded header bar only.

Content:
1. Document name + "Sent by [sender name]" subheading
2. PDF Viewer with FieldOverlay in `sign` mode — this signer's fields highlighted, others hidden
3. Progress indicator: "2 of 5 fields completed" — sticky at top of viewport on scroll
4. When a field is clicked → Signature Capture modal opens
5. **Sticky bottom bar:**
   - Consent checkbox: "I agree to sign electronically under the Florida UETA (§668.50) and federal ESIGN Act" — `text-[var(--text-secondary)]` body-small
   - "Finish" primary button — enabled only when all required fields filled AND consent checked
   - "Decline" ghost button — opens confirmation dialog

**Signature reuse behavior:**
- First time signer draws/types a signature → value cached in React state
- Subsequent signature fields: auto-fill with cached value, show small "Re-draw" link
- Initials cached separately from full signature
- Cache cleared on page reload (not persisted)

**States:**
- Loading: skeleton with community branding
- Invalid/expired token: "This signing link has expired or is no longer valid" with community contact info
- Sequential wait: "Waiting for [previous signer name] to sign first" with status indicator
- Already completed: "You have already signed this document" with completion timestamp
- Submission cancelled: "This signing request has been cancelled"
- **Success (after submit):** Inline success state — checkmark animation, "You have signed [document name]", "All signers must complete before the final document is available" or download link if all done

#### F2. Signature capture modal
**Files:** Create `apps/web/src/components/esign/signature-capture.tsx`

```typescript
interface SignatureCaptureProps {
  mode: 'signature' | 'initials';
  cachedValue?: string;           // pre-fill from previous capture
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}
```

**Three tabs:**
- **Draw** — Canvas via `signature_pad`. Clear + undo buttons. Black ink on white. Canvas height: 200px for signature, 100px for initials.
- **Type** — Text input. Preview rendered in system cursive font (`font-family: 'Brush Script MT', 'Segoe Script', cursive`). No external font loading. Size auto-scales to fit.
- **Upload** — File input (PNG/JPG, max 2MB). Preview with crop indicator.

**Output:** PNG data URL (base64).

**If `cachedValue` provided:** Shows "Use previous signature" option at top with preview. One click to reuse.

Design tokens: Modal with `var(--radius-lg)`, `var(--elevation-e3)`, `var(--surface-card)`. Tab buttons: `Button` ghost with active underline `var(--interactive-primary)`.

---

### Track G: Submission Management UI (Days 12-16)

#### G1. E-sign landing page (submissions-first)
**Files:** Create `apps/web/src/app/(authenticated)/esign/page.tsx`

**Not a dashboard with summary cards.** Opens directly to the submissions list with a tab bar to switch between submissions and templates.

Layout:
- Tab bar: "Documents" (submissions list, default) | "Templates"
- "Send Document" primary button in header (→ submission creation)
- "Documents" tab shows G2 content; "Templates" tab shows E5 content

This avoids a low-value dashboard landing page and puts users one click from their most common action.

#### G2. Submission list (rendered within G1's "Documents" tab)
**Files:** Create `apps/web/src/components/esign/submission-list.tsx`

- Table: template name, status badge, signer progress ("2/3 signed" with mini progress bar), created date, expires date
- Status filter: segmented control (All / Pending / Completed / Expired)
- Row click → navigate to detail page
- Row actions: remind (if pending), cancel (if pending), download (if completed)
- Empty state: "No documents yet. Send your first document for signing."

Design: `Badge` for status — pending=`warning`, completed=`success`, expired=`neutral`, cancelled=`danger`.

**Optimistic updates:** Cancel and remind mutations use TanStack Query optimistic updates for instant feedback.

#### G3. Submission detail page
**Files:** Create `apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx`

Two-column layout on desktop, stacked on mobile:

**Left column (wide):** PDF preview with FieldOverlay in `view` mode. If completed: shows signed PDF. If pending: shows source PDF with field positions.

**Right column (narrow):**
- Status header with badge
- Signer cards: each signer with name, email, role, status badge, opened/completed timestamps. Sequential order shown via numbered badges.
- Actions section:
  - Pending: "Send Reminder" (secondary), "Cancel" (danger ghost)
  - Completed: "Download Signed PDF" (primary), "Export Audit Trail" (secondary, JSON download)
- Event timeline: chronological from `esign_events`. Each event: type icon, description, timestamp, IP (truncated, expandable).

#### G4. Submission creation form
**Files:** Create `apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx`

Query param: `?templateId=123` (pre-selects template if coming from template detail page).

- **Step 1: Select template** — searchable dropdown of active templates. Shows template name, type, role count. If pre-selected via query param, skip to step 2.
- **Step 2: Configure & send** (single form):
  - Signers section: for each `signerRole` in the template, add signer(s). Each signer row: email input, name input, role label (from template). Add/remove signers per role.
  - Signing order: toggle switch "Require signers to sign in order" (default off = parallel)
  - Expiration: optional date picker, default 30 days
  - Custom message: collapsible section with subject + body fields
  - Link to document: optional, searchable dropdown of community documents
  - **"Send for Signing" primary button** — shows confirmation count ("Send to 3 signers?")

---

### Track H: TanStack Query Hooks (Days 8-10, parallel with UI)

#### H1. Template hooks
**Files:** Create `apps/web/src/hooks/use-esign-templates.ts`

```typescript
export const ESIGN_TEMPLATE_KEYS = {
  all: ['esign-templates'] as const,
  list: (communityId: number, filters?: Record<string, string>) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'list', communityId, filters] as const,
  detail: (communityId: number, id: number) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'detail', communityId, id] as const,
};

export function useEsignTemplates(communityId: number, filters?: { status?: string; type?: string });
export function useEsignTemplate(communityId: number, templateId: number);
export function useCreateEsignTemplate(communityId: number);   // invalidates list
export function useUpdateEsignTemplate(communityId: number);   // invalidates list + detail
export function useArchiveEsignTemplate(communityId: number);  // optimistic: remove from list
export function useCloneEsignTemplate(communityId: number);    // invalidates list
```

#### H2. Submission hooks
**Files:** Create `apps/web/src/hooks/use-esign-submissions.ts`

```typescript
export const ESIGN_SUBMISSION_KEYS = {
  all: ['esign-submissions'] as const,
  list: (communityId: number, filters?: Record<string, string>) =>
    [...ESIGN_SUBMISSION_KEYS.all, 'list', communityId, filters] as const,
  detail: (communityId: number, id: number) =>
    [...ESIGN_SUBMISSION_KEYS.all, 'detail', communityId, id] as const,
};

export function useEsignSubmissions(communityId: number, filters?: { status?: string });
export function useEsignSubmission(communityId: number, submissionId: number);
export function useCreateEsignSubmission(communityId: number);
export function useCancelEsignSubmission(communityId: number);   // optimistic status update
export function useSendEsignReminder(communityId: number);       // optimistic reminderCount++
```

#### H3. Signing hook (public page, no auth context)
**Files:** Create `apps/web/src/hooks/use-esign-signing.ts`

```typescript
export function useSigningContext(submissionExternalId: string, slug: string);
export function useSubmitSignature(submissionExternalId: string, slug: string);
export function useDeclineSigning(submissionExternalId: string, slug: string);
```

These hooks call the token-authenticated `/api/v1/esign/sign/` routes. No community context needed.

---

### Track I: Pre-Built Templates (Days 14-16)

#### I1. Pre-built template definitions
**Files:** Create `apps/web/src/lib/esign/prebuilt-templates.ts`

Single file exporting template definitions (not separate files per template — they're just data).

```typescript
export const PREBUILT_TEMPLATES = {
  proxy_form: {
    name: 'Proxy Designation Form',
    templateType: 'proxy' as const,
    description: 'Authorize another person to vote on your behalf at association meetings.',
    signerRoles: ['unit_owner', 'proxy_holder'],
    fieldsSchema: { version: 1, fields: [...], signerRoles: ['unit_owner', 'proxy_holder'] },
    // Source PDF path (relative to seed assets)
    sourceAsset: 'esign/proxy-designation-form.pdf',
  },
  violation_ack: {
    name: 'Violation Acknowledgment',
    templateType: 'violation_ack' as const,
    description: 'Acknowledge receipt of a violation notice.',
    signerRoles: ['unit_owner'],
    fieldsSchema: { version: 1, fields: [...], signerRoles: ['unit_owner'] },
    sourceAsset: 'esign/violation-acknowledgment.pdf',
  },
} as const;
```

#### I2. Source PDF assets
**Files:** Create PDFs in `packages/db/seeds/esign/`

Simple, clean single-page PDFs for each pre-built template. Generated via any PDF tool or a simple HTML-to-PDF conversion.

#### I3. Seed data for demo communities
**Files:** Modify `scripts/seed-demo.ts`

- 2 templates per demo community (proxy form + violation ack)
- 1 completed submission with full event trail (created → sent → opened → signed → completed)
- 1 pending submission (1/2 signers completed)

---

### Track J: Integration & Wiring (Days 15-17)

#### J1. Navigation integration
**Files:** Modify `apps/web/src/components/layout/app-sidebar.tsx`

- Add "E-Sign" nav item with `FileSignature` icon from lucide-react
- Gate behind `hasEsign` feature flag
- Visible to `ESIGN_ELEVATED_ROLES` only
- Position: after Documents, before Settings

#### J2. Middleware update for signing routes
**Files:** Modify `apps/web/src/middleware.ts`

- Add `/sign/:path*` to public route list (no auth redirect)
- Add `/api/v1/esign/sign/:path*` to token-authenticated route allowlist
- Apply rate limiting: 10 requests/min/IP on signing endpoints

---

## 5. File Summary

| Action | Path | Track |
|--------|------|-------|
| **Create** | `packages/db/migrations/0100_esign_native_template_support.sql` | A3 |
| **Modify** | `packages/db/src/schema/esign.ts` — make `docusealTemplateId` nullable, add 3 columns | A3 |
| **Modify** | `packages/shared/src/esign-constants.ts` — add field types, signing orders, field schema interfaces | A4 |
| **Create** | `apps/web/src/lib/esign/pdf-worker-config.ts` | A2 |
| **Create** | `apps/web/src/lib/services/esign-service.ts` | B1 |
| **Create** | `apps/web/src/lib/services/esign-pdf-service.ts` | B2 |
| **Create** | `apps/web/src/app/api/v1/esign/templates/route.ts` | C1 |
| **Create** | `apps/web/src/app/api/v1/esign/templates/[id]/route.ts` | C1 |
| **Create** | `apps/web/src/app/api/v1/esign/templates/[id]/clone/route.ts` | C1 |
| **Create** | `apps/web/src/app/api/v1/esign/submissions/route.ts` | C2 |
| **Create** | `apps/web/src/app/api/v1/esign/submissions/[id]/route.ts` | C2 |
| **Create** | `apps/web/src/app/api/v1/esign/submissions/[id]/cancel/route.ts` | C2 |
| **Create** | `apps/web/src/app/api/v1/esign/submissions/[id]/remind/route.ts` | C2 |
| **Create** | `apps/web/src/app/api/v1/esign/submissions/[id]/download/route.ts` | C2 |
| **Create** | `apps/web/src/app/api/v1/esign/sign/[submissionExternalId]/[slug]/route.ts` | C3 |
| **Create** | `apps/web/src/app/api/v1/esign/consent/route.ts` | C4 |
| **Create** | `packages/email/src/templates/esign-invitation-email.tsx` | D1 |
| **Create** | `packages/email/src/templates/esign-completed-email.tsx` | D2 |
| **Create** | `packages/email/src/templates/esign-reminder-email.tsx` | D3 |
| **Modify** | `packages/email/src/index.ts` — add barrel exports | D4 |
| **Create** | `apps/web/src/components/esign/pdf-viewer.tsx` | E1 |
| **Create** | `apps/web/src/components/esign/field-overlay.tsx` | E2 |
| **Create** | `apps/web/src/components/esign/field-palette.tsx` | E3 |
| **Create** | `apps/web/src/app/(authenticated)/esign/templates/new/page.tsx` | E4 |
| **Create** | `apps/web/src/app/(authenticated)/esign/templates/page.tsx` | E5 |
| **Create** | `apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx` | E5 |
| **Create** | `apps/web/src/app/sign/[submissionExternalId]/[slug]/page.tsx` | F1 |
| **Create** | `apps/web/src/components/esign/signature-capture.tsx` | F2 |
| **Create** | `apps/web/src/app/(authenticated)/esign/page.tsx` | G1 |
| **Create** | `apps/web/src/components/esign/submission-list.tsx` | G2 |
| **Create** | `apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx` | G3 |
| **Create** | `apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx` | G4 |
| **Create** | `apps/web/src/hooks/use-esign-templates.ts` | H1 |
| **Create** | `apps/web/src/hooks/use-esign-submissions.ts` | H2 |
| **Create** | `apps/web/src/hooks/use-esign-signing.ts` | H3 |
| **Create** | `apps/web/src/lib/esign/prebuilt-templates.ts` | I1 |
| **Modify** | `scripts/seed-demo.ts` — add e-sign demo data | I3 |
| **Modify** | `apps/web/src/components/layout/app-sidebar.tsx` — add E-Sign nav | J1 |
| **Modify** | `apps/web/src/middleware.ts` — add `/sign/*` to public routes | J2 |

**Total: 27 new files, 7 modified files, 1 migration.** (Down from 32+8 in v1.)

---

## 6. Dependency Graph

```
Track A: Foundation
  A1 (npm deps) ───────────────────────────────────────────────┐
  A2 (pdf worker config) ──────────────────────────────────┐   │
  A3 (migration + Drizzle schema) ────────────────────┐    │   │
  A4 (shared constants + types) ─────┐                │    │   │
                                     │                │    │   │
Track B: Services                    ▼                ▼    ▼   ▼
  B1 (esign svc, includes token+consent) ◄─────────────────────┤
  B2 (pdf svc) ─────────────────────────────────────────────────┤
                             │                                  │
Track C: API Routes          ▼                                  │
  C1 (templates) ◄── B1                                        │
  C2 (submissions) ◄── B1                                      │
  C3 (signing) ◄── B1                                          │
  C4 (consent mgmt) ◄── B1                                     │
                             │                                  │
Track D: Email (parallel)    │                                  │
  D1-D3 (templates) ◄── B1  │                                  │
                             │                                  │
Track H: Hooks (after C)     │                                  │
  H1-H3 ◄── C1-C3           │                                  │
                             │                                  │
Track E: Template Builder    │                                  │
  E1 (pdf viewer) ◄── A1+A2 │                                  │
  E2 (field overlay) ◄── E1+A1 (@dnd-kit)                      │
  E3 (field palette) ─────┘                                     │
  E4 (builder page) ◄── E1+E2+E3+H1                            │
  E5 (templates page + detail) ◄── E1+H1                       │
                             │                                  │
Track F: Signing Flow        │                                  │
  F2 (sig capture) ◄── A1   │                                  │
  F1 (signing page) ◄── E1+E2+F2+H3                            │
                             │                                  │
Track G: Submission Mgmt     │                                  │
  G1 (landing page) ◄── G2+E5                                  │
  G2 (submission list) ◄── H2                                   │
  G3 (detail page) ◄── E1+E2+H2                                │
  G4 (creation form) ◄── H1+H2                                 │
                             │                                  │
Track I: Pre-built + Seed    │                                  │
  I1 (template defs) ◄── A4                                    │
  I3 (seed) ◄── I1+B1                                          │
                             │                                  │
Track J: Integration         │                                  │
  J1 (nav) ◄── G1                                              │
  J2 (middleware) ◄── C3                                        │
```

**Parallelization:**
- Tracks A and D can proceed simultaneously
- E1/F2 can start after A (only need npm deps + worker config)
- B starts after A3+A4 (needs schema + constants)
- C starts after B
- H starts after C
- E (rest), F, G start after H
- Track J is last

**Critical path:** A1 → A3 → B1 → C1/C2/C3 → H1/H2/H3 → E4 (template builder) → F1 (signing page) → Ship Gate

---

## 7. Design System Compliance

All new UI uses semantic tokens from `packages/ui/src/styles/tokens.css`. Never use Tailwind literal color classes.

| Element | Token(s) |
|---------|----------|
| Page containers | `Card` component, `var(--surface-card)`, `var(--border-subtle)`, `var(--radius-md)` (10px) |
| Template builder sidebar | `var(--surface-card)`, `var(--border-subtle)` dividers |
| PDF viewer container | `var(--surface-subtle)` background, `var(--elevation-e1)` shadow on canvas |
| Field overlay markers (edit) | Color per signer role (see E2 color mapping) with `var(--radius-sm)` (6px) corners |
| Selected field | `ring-2 ring-[var(--interactive-primary)]` |
| Unfilled required field (sign mode) | `ring-2 ring-[var(--border-error)] animate-pulse` |
| Filled field (sign mode) | `ring-2 ring-[hsl(142,71%,45%)]` + checkmark |
| Status badges | `Badge` component: pending=`warning`, completed=`success`, declined/expired/cancelled=`danger`, opened=`info` |
| Signer progress bar | `var(--interactive-primary)` fill, `var(--surface-muted)` track |
| Signature capture modal | `var(--radius-lg)` (16px), `var(--elevation-e3)`, `var(--surface-card)` |
| Signature canvas | White background, 1px `var(--border-default)` border |
| Tab buttons (draw/type/upload) | `Button` ghost, active = `border-b-2 border-[var(--interactive-primary)]` |
| Form inputs | `var(--input-height-md)` (40px), `var(--radius-sm)` (6px) |
| Primary CTA | `Button` primary — "Sign", "Send for Signing", "Save Template" |
| Danger actions | `Button` danger ghost — "Cancel", "Decline" |
| Empty states | `border-dashed border-[var(--border-default)]`, `text-[var(--text-secondary)]` |
| Event timeline | vertical line `var(--border-subtle)`, dots `var(--interactive-primary)` (completed) / `var(--border-default)` (pending) |
| Touch targets | 44x44px minimum on all interactive elements |
| Focus rings | `outline: 2px solid var(--border-focus)` with 2px offset |
| Transitions | `transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]` |

### Responsive Behavior

| Breakpoint | Template Builder | Signing Page |
|------------|-----------------|--------------|
| `<768px` | Stacked: PDF on top, palette as bottom sheet | Full-width PDF, bottom action bar, modal captures fill viewport |
| `768-1023px` | Side-by-side with narrow palette | Comfortable PDF width, bottom action bar |
| `>=1024px` | Full side-by-side with properties panel | Centered PDF with margins, bottom action bar |

---

## 8. Security & Validation

| Concern | Mitigation |
|---------|------------|
| Signing token guessing | 256-bit entropy (two concatenated UUIDs, 64 hex chars). Brute-force infeasible. Rate limited to 10 req/min/IP. Invalid slugs return 404 (no timing oracle — constant-time DB lookup). |
| Signing token replay | Token validated against signer status — only `pending`/`opened` signers can act. After completion/decline, the slug is dead. |
| Signed document integrity | SHA-256 hash of flattened PDF stored in `document_hash` and logged in `esign_events`. Any download verifiable against stored hash. |
| Cross-tenant isolation | All admin-facing service functions use `createScopedClient(communityId)`. RLS policies enforce at DB level. **Signing routes exception:** `getSignerContext` and `submitSignature` use `createAdminClient()` (service role) because external signers have no Supabase session (`auth.uid()` is NULL). These functions scope queries by slug → signer → submission, returning only that specific signer's data. The admin client bypasses RLS; security is enforced at the application layer (slug validation + signer status check). |
| External signer data minimization | Signing GET returns only: document PDF, this signer's fields, signer name/email, submission metadata. No other signers, no community internals. |
| XSS in PDF viewer | `pdfjs-dist` renders to `<canvas>` — inherently XSS-safe. No HTML injection vector. |
| File upload validation | Reuse existing `validateFile()` — magic bytes + MIME + size limits. Only `application/pdf` for templates. Max 20MB. |
| UETA/ESIGN compliance | Dual-path consent (§2.2): PropertyPro users → `esign_consent` table (revocable). External signers → `esign_events` `consent_given` (append-only). Both capture: full consent text, IP, user agent, timestamp. All signers have tamper-evident audit trail regardless of account status. |
| Rate limiting | Existing rate limiter applied to `/api/v1/esign/sign/*`. 10 requests/min/IP. |
| Expiration enforcement | Server-side: if `expiresAt < now()`, return 410 Gone. |
| Coordinate injection | Field coordinates validated: `0 ≤ x,y ≤ 100`, `0 < width,height ≤ 100`, `x+width ≤ 100`, `y+height ≤ 100`. Prevents off-page embedding. |
| Large PDF DoS | Template upload limited to 20MB. PDF service sets timeout on flattening operations. pdfjs-dist worker runs in separate thread. |

---

## 9. Testing Plan

### Unit Tests

| Test | File |
|------|------|
| Field schema validation — rejects invalid coordinates, off-page fields, missing roles | `__tests__/esign-service.test.ts` |
| Slug generation — 64-char hex, URL-safe (no `+`, `/`, `=`), unique across signers | `__tests__/esign-service.test.ts` |
| Slug lookup — returns signer context for valid slug, 404 for unknown, 410 for expired | `__tests__/esign-service.test.ts` |
| Coordinate translation (percentage → PDF points, Y-axis inversion) | `__tests__/esign-pdf-service.test.ts` |
| Document hash — deterministic SHA-256 for same input | `__tests__/esign-pdf-service.test.ts` |
| Sequential signing — signer sort_order=1 blocked until sort_order=0 complete | `__tests__/esign-service.test.ts` |
| Reminder limit — 4th reminder rejected | `__tests__/esign-service.test.ts` |
| Consent record created as side effect of signature submission | `__tests__/esign-service.test.ts` |
| Zod schema validation — accept valid, reject invalid for all API schemas | `__tests__/schemas.test.ts` |

### Integration Tests

| Test | Scenario |
|------|----------|
| Template CRUD lifecycle | Create → list → get → archive → verify hidden from active list |
| Submission full lifecycle | Create → signers receive tokens → sign all → submission auto-completes → signed PDF exists in Storage |
| Sequential signing enforcement | Signer sort_order=1 GET returns "waiting" state until sort_order=0 completes |
| Signing via token | GET context → POST signature → signer status=completed → events logged with IP |
| Cross-tenant isolation | Community A templates not visible to Community B admin |
| Consent dual-path | Internal signer (has userId): signature POST creates `esign_consent` record + `consent_given` event. External signer (no userId): `consent_given` event only, no `esign_consent` row. Both capture IP + UA + consent text. |
| Reminder limits | After 3 reminders, POST to remind returns 422 |
| Expiration | Expired submission GET returns 410 |
| Audit trail completeness | Full lifecycle produces correct `esign_events` chain |
| Decline flow | Signer declines → submission marked declined → other signers' tokens invalidated |

### Manual Testing

| Scenario | Steps |
|----------|-------|
| Template builder | Upload PDF → define 2 roles → place signature + date fields on page 2 → save → verify in list |
| Full sign cycle (parallel) | Create submission with 2 signers → both sign → signed PDF downloadable |
| Full sign cycle (sequential) | Create with sequential → signer 1 signs → signer 2 link becomes active → signs → complete |
| Signature reuse | Signer has 3 signature fields → draw once → verify auto-fill on fields 2+3 |
| Type signature | Use "Type" tab → verify text renders in final PDF |
| Cancel in progress | Cancel pending submission → verify signing page shows "cancelled" |
| Send 3 reminders | Verify 4th is rejected with error message |
| Expiration | Set 1-hour expiry → wait → verify signing page shows "expired" |
| Mobile signing | Test at 375px: signature canvas usable, fields tappable, bottom bar accessible |
| Decline | Signer clicks "Decline" → confirm → verify submission marked declined |

---

## 10. Ship Gate

All items must pass before merging:

- [ ] **Full sign cycle**: upload template → place fields → send → sign → complete (2+ signers, parallel)
- [ ] **Sequential signing**: signer 2 blocked until signer 1 completes
- [ ] **Signature reuse**: draw once, auto-fills subsequent signature fields
- [ ] **UETA/ESIGN compliance**: consent captured inline during signing POST, record includes text + IP + UA + timestamp
- [ ] **Audit trail**: all `esign_events` event types produce correct records with IP + timestamp
- [ ] **Tamper evidence**: SHA-256 hash of signed PDF stored in `document_hash`
- [ ] **2 pre-built templates**: proxy form + violation ack functional
- [ ] **Custom templates**: user can upload any PDF and place arbitrary fields
- [ ] **Signed PDFs stored**: in Supabase Storage at `signed_document_path`, downloadable via presigned URL
- [ ] **Email invitations**: invitation + reminder + completion emails send correctly
- [ ] **Feature flag**: all routes gate on `hasEsign`
- [ ] **RBAC**: non-elevated roles cannot create templates/submissions
- [ ] **Cross-tenant isolation**: templates/submissions/signers scoped by `community_id`
- [ ] **Signing page works without session**: external signers sign via encrypted token URL
- [ ] **Decline flow**: signer can decline, submission marked accordingly
- [ ] **Expiration**: expired submissions show correct message, signing blocked
- [ ] **Mobile responsive**: signing page usable at 375px viewport, touch targets ≥44px
- [ ] **Template builder**: renders 20-page PDF without jank, field placement via @dnd-kit with keyboard accessibility
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (including `guard:db-access`)
- [ ] `pnpm test` passes

---

## 11. Out of Scope (Deferred)

| Item | Deferred to | Reason |
|------|-------------|--------|
| **Audit certificate PDF** | Post-ship v1.1 | pdf-lib lacks text layout. UI audit trail + JSON export sufficient for v1. |
| **Bulk send** (one template → many recipients) | Post-ship | Complexity. v1 focuses on correctness. |
| **Template versioning** | Post-ship | Clone covers use cases. |
| **In-person / kiosk signing** | Future | Different UX flow. |
| **SMS signing reminders** | After Phase 1B | No Twilio infrastructure yet. |
| **ARC approval letter auto-generation** | After Phase 1E | Requires ARC UI. |
| **Proxy form auto-registration for voting** | After Phase 1D | Requires voting system. |
| **Lease agreement template** | Phase 2C | Requires apartment lease tracking. |
| **Estoppel request template** | Post-ship | Custom template covers this. |
| **Standalone consent ceremony page** | Post-ship | Inline consent during signing is legally sufficient. Standalone page adds friction without legal benefit. |
| **DocuSeal CE fallback** | N/A | Removed. Native-only. |
| **Google Calendar integration for signing deadlines** | Phase 3+ | Calendar sync infrastructure not ready. |

---

## 12. UX Audit (v2 → v3 Addendum)

### Audit Methodology

Reviewed against: DocuSign/HelloSign production UX, WCAG 2.1 AA, PatternFly interaction guidelines, 18F government UX research, shadcn/ui component model, Front-End Design Checklist, and existing PropertyPro codebase conventions (custom modals, `useState`-based forms, `Badge`/`Card`/`Button` from `@propertypro/ui`, `StatusBadge` pattern, `role="alert"` for errors).

### Findings

| # | Area | Issue | Severity | Fix |
|---|------|-------|----------|-----|
| U1 | **Signing page** | No trust signals. Signers are asked to execute a legal act on a bare page with no security indicators. | High | Add: lock icon + "Secured with 256-bit encryption" in header. Show signer's name pre-populated ("Signing as Alice Johnson"). Show sender identity clearly ("From Sunset Condos Board"). These reduce abandonment. |
| U2 | **Signing page** | No connection loss recovery. If signer loses connection mid-fill, all captured signatures are lost (cached in React state only). | High | Auto-save signed field values to the server after each field is captured via a `PATCH` to the signing API. On return visit (same slug), restore previously captured values. Show "Your progress has been saved" toast. |
| U3 | **Signing page** | No contextual help for fields. Signer sees colored boxes on a PDF but no explanation of what they're being asked to sign or why. | High | Each field marker in sign mode shows a tooltip/label: "Your signature", "Today's date", "Your initials". Tapping a field shows the label prominently in the capture modal header. For the overall document: show sender's custom `messageBody` as a collapsible banner above the PDF. |
| U4 | **Signing page** | Consent checkbox text is legal jargon in small gray type. This is the opposite of informed consent — it's hidden consent. | Medium | Use progressive disclosure: short plain-language summary ("I agree to sign this document electronically") with an expandable "View full legal disclosure" link that reveals the full UETA/ESIGN text. Checkbox label should be readable (`text-[var(--text-primary)]`, not `--text-secondary`). |
| U5 | **Signing page — mobile** | Signature canvas at fixed 200px height is too small on phones. Drawing a legible signature on a 375px-wide, 200px-tall canvas is frustrating. | High | On mobile (`<768px`), signature capture should open as a **full-screen sheet** (not a centered modal). Canvas takes full viewport width minus padding. Minimum canvas height: 50vh. Landscape prompt: "Rotate your device for more space" (optional, not required). CSS `touch-action: none` on canvas to prevent scroll conflicts. |
| U6 | **Signing page — mobile** | No mention of how PDF fields are tapped on a small screen. Fields placed at 5% width on a desktop-rendered PDF become 15px wide on a phone — below the 44px touch target. | High | On mobile, field overlay markers should have a **minimum rendered size of 48x48px** regardless of their defined width/height percentage. They visually expand on hover/focus. The tap target can be larger than the visual marker. When a field is tapped, auto-zoom the PDF to that field's region before opening the capture modal. |
| U7 | **Template builder** | No undo/redo. Accidentally deleting or misplacing a field requires manually re-creating it. This is a basic expectation in any editor. | Medium | Implement simple undo/redo stack for field placement operations (add, move, resize, delete). Ctrl+Z / Ctrl+Shift+Z (Cmd on Mac). Stack depth: 20 operations. UI: undo/redo buttons in the editor toolbar. |
| U8 | **Template builder** | No click-to-place alternative. WCAG 2.5.7 (Dragging Movements) requires that "all functionality that uses dragging can be achieved by a single pointer without dragging." The plan has @dnd-kit for drag but no non-drag placement method. | High | Add **click-to-place mode** (already partially described in E3 — "click a field type → click on PDF to place"). Make this the *primary* interaction, with drag as an *enhancement*. Flow: (1) select field type in palette, (2) click location on PDF, (3) field appears at click position with default size. Drag is for repositioning after placement. This satisfies WCAG 2.5.7. |
| U9 | **Template builder** | No zoom controls. PDF rendered at scale=1 may be too small for field precision on complex documents, or too large for overview on smaller screens. | Medium | Add zoom controls: fit-to-width (default), 75%, 100%, 125%, 150%. Use `+`/`-` buttons or a dropdown. Pinch-to-zoom on touch. Current scale shown in toolbar. |
| U10 | **Template builder** | No alignment aids. Placing multiple fields with consistent alignment requires eyeballing. | Low | Deferred post-ship. Note: Consider snap-to-grid (8px increments) and alignment guides (blue lines showing when a field aligns with another) in v1.1. For now, the properties panel with exact x/y percentage inputs provides precision. |
| U11 | **Submission creation** | No signer auto-complete from community members. The form requires manually typing email + name for each signer, even when the signer is a known community member (owner, board member). | Medium | Add community member search: when typing in the email field, show a dropdown of matching community members (search by name or email). Selecting a member auto-fills email, name, and sets `userId`. External signers (not community members) are typed manually. Pattern: follow the existing `link-document-modal.tsx` search pattern. |
| U12 | **Submission creation** | No preview of what signers will see. Admin sends a document blindly — they can't verify the signing experience before sending. | Medium | Add "Preview as Signer" button that opens a read-only version of the signing page in a new tab (or modal). Shows the PDF with fields highlighted for the selected signer role. Does not require actual sending. |
| U13 | **Email templates** | Invitation email has no document preview or context. Just a CTA button. Signers are more likely to click if they can see what they're signing. | Medium | Include in invitation email: document name, sender name + role, expiration date, custom message (if provided), and a 1-2 sentence plain-language description of the template type ("You are being asked to sign a proxy designation form for the upcoming board meeting"). |
| U14 | **Owner/tenant signing discovery** | Plan only addresses admin-side management. Missing: how do owners/tenants discover they have pending signatures? No in-app notification, no dashboard widget. | High | Add to the owner/resident dashboard: a "Pending Signatures" card that shows count of documents awaiting this user's signature. Each item links directly to the signing page. Uses `esign_signers` filtered by `userId` + `status='pending'`. This is a **read-only widget**, not an admin feature — owners see it even though they can't access the E-Sign admin section. |
| U15 | **Mobile navigation** | Plan modifies the desktop sidebar but doesn't address mobile. The mobile bottom tab bar (`BottomTabBar.tsx`) has a "More" menu — e-sign needs to be discoverable there. | Medium | For admin roles: add "E-Sign" to the mobile More menu, gated by `hasEsign`. For owner/tenant roles: the pending signatures widget (U14) on the dashboard is sufficient — they don't need a nav entry. |
| U16 | **Status badges — color only** | Status badges use color variants (warning, success, danger) but the plan doesn't specify icons. Color-only status violates WCAG 1.4.1 (Use of Color). | Medium | Every status badge must include an icon alongside the color: pending = `Clock` icon, completed = `Check` icon, declined = `X` icon, expired = `AlertTriangle` icon, opened = `Eye` icon, cancelled = `Ban` icon. Use the existing `StatusBadge` component pattern which supports `showIcon`. |
| U17 | **Focus management** | Plan specifies modals (signature capture, decline confirmation) but no focus management. When a modal opens, focus must move to it. When it closes, focus must return to the trigger element. | Medium | All modals: (1) trap focus within modal while open, (2) set initial focus to first interactive element (or close button), (3) close on Escape, (4) return focus to trigger element on close. Use `useRef` to track the trigger. This matches the existing custom modal pattern in the codebase. |
| U18 | **Screen reader announcements** | No ARIA attributes specified for the signing flow. Field state changes (filled/unfilled), progress updates, and submission results are invisible to assistive technology. | High | Specific ARIA requirements: (1) PDF viewer: `role="document"` + `aria-label="Document: [name]"`, (2) field overlay in sign mode: each field `role="button"` + `aria-label="[field type] field, [required/optional], [filled/unfilled]"`, (3) progress indicator: `role="status"` + `aria-live="polite"` — announces "3 of 5 fields completed" on each change, (4) submission result: `role="alert"` — announces "Document signed successfully" or error message. |
| U19 | **Error messages** | Plan says "retry button with 'Failed to load document' message" but doesn't specify actionable error copy. | Low | Follow the 18F pattern: lead with what happened, then what to do. Examples: "This document couldn't be loaded. Check your internet connection and try again." / "Your signature couldn't be saved. Please try again — your other signatures are preserved." / "This signing link has expired. Contact [community name] to request a new one." |

### User Journey Specifications

The plan defines pages and components but doesn't map the end-to-end experience for each user type. These journeys fill that gap.

#### Journey 1: Board President creates & sends a proxy form

```
Sidebar → "E-Sign" → Submissions tab (empty state)
  → "Send Document" button
    → Submission creation page
      → Selects "Proxy Designation Form" template (pre-built)
      → Types "Alice Johnson" in signer field, starts typing "alice" →
        dropdown shows "Alice Johnson (alice.johnson@sunset.local, Unit 301)"
        → selects, auto-fills email + name + userId
      → Adds second signer: "Bob Smith" (proxy holder) — types manually (external)
      → Signing order: parallel (default)
      → Clicks "Send for Signing" → confirmation dialog "Send to 2 signers?"
      → Confirms → redirect to submission detail page
        → Shows: 2 signer cards (both "Pending"), event timeline with "Created" entry
```

**Key UX moments:** Community member auto-complete saves typing. Confirmation prevents accidental sends. Immediate redirect to detail page gives confidence.

#### Journey 2: Owner receives invitation & signs on mobile

```
Email arrives: "Sunset Condos has sent you a document to sign"
  → Shows: document name, sender, expiration, custom message
  → Clicks "Review & Sign Document"
    → Opens signing page in mobile browser (375px)
      → Header: lock icon + "Secured" + "Sunset Condos"
      → Banner: sender's message (collapsible)
      → PDF rendered full-width, fields zoomed to show clearly
      → Sticky progress bar: "0 of 3 fields completed"
      → Taps first field (signature) → auto-zooms to field region
        → Full-screen sheet opens: "Your Signature"
          → Draw tab active, canvas fills width, min 50vh height
          → Draws signature → "Apply" button
          → Sheet closes, field shows green checkmark
          → Progress: "1 of 3 fields completed"
      → Taps second field (date) → auto-fills today's date (editable)
      → Taps third field (initials) → separate capture from signature, smaller canvas
      → Progress: "3 of 3 fields completed"
      → Bottom bar: consent checkbox (plain language) + "Finish" button (now enabled)
      → Checks consent → "Finish" → brief loading state
      → Success: checkmark animation + "You've signed [document name]"
        → "All signers must complete before the final document is available"
```

**Key UX moments:** No account required. Trust signals in header. Auto-zoom to fields on mobile. Full-screen capture sheet. Auto-fill date. Plain-language consent. Immediate success feedback.

#### Journey 3: Owner discovers pending signature on dashboard

```
Owner logs into dashboard (desktop or mobile)
  → "Pending Signatures" card visible (between announcements and meetings)
    → Shows: "1 document awaiting your signature"
    → Card body: "Proxy Designation Form — from Board President"
    → "Sign Now" button → opens signing page in new tab
```

**Key UX moments:** Owner doesn't need to know about "E-Sign" as a feature. The pending signature surfaces where they already look (dashboard). Direct link to sign — no intermediate pages.

#### Journey 4: CAM tracks submission progress

```
Sidebar → "E-Sign" → Submissions tab
  → Table shows: "Proxy Form" | "1/2 signed" (progress bar) | "Pending" badge + Clock icon
  → Clicks row → Submission detail page
    → Left: PDF preview with field positions shown
    → Right:
      → Signer 1: "Alice Johnson" — ✓ Completed, March 18 at 2:30 PM
      → Signer 2: "Bob Smith" — ○ Pending (sent March 18)
    → Actions: "Send Reminder" button for Bob
      → Clicks → toast: "Reminder sent to Bob Smith" (optimistic)
    → Event timeline: Created → Sent (×2) → Opened (Alice) → Signed (Alice) → Reminder Sent (Bob)
```

**Key UX moments:** Progress bar in list gives at-a-glance status. Detail page shows exactly who's blocking. One-click reminder with optimistic feedback. Timeline tells the full story.

### Revised Component Specifications

These revisions apply to the components in Tracks E, F, and G based on the audit findings above.

#### F1 Signing Page — Revised Layout

```
┌──────────────────────────────────────────────────────────┐
│ 🔒 Secured · Sunset Condos                              │ ← Trust header
├──────────────────────────────────────────────────────────┤
│ Signing as: Alice Johnson · alice@example.com             │ ← Identity bar
├──────────────────────────────────────────────────────────┤
│ ▼ Message from Board President                           │ ← Collapsible
│   "Please sign this proxy form for the March meeting."    │    sender message
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                                                      │ │
│  │              PDF Document                            │ │
│  │              with highlighted fields                 │ │
│  │                                                      │ │
│  │   ┌──────────────────┐                              │ │
│  │   │ ✍ Your Signature │  ← tappable field marker    │ │
│  │   └──────────────────┘                              │ │
│  │                                                      │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  Page 1 of 2   ◀ ▶                                       │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ ━━━━━━━━━━━━━━━━━━░░░░░  2 of 3 fields completed        │ ← Progress bar
├──────────────────────────────────────────────────────────┤
│ ☐ I agree to sign electronically ⓘ                       │ ← Consent
│              [ Decline ]     [ Finish ✓ ]                │ ← Actions
└──────────────────────────────────────────────────────────┘
```

#### F2 Signature Capture — Mobile Full-Screen Sheet

```
Mobile (<768px):                    Desktop (>=768px):
┌────────────────────┐              ┌─── centered modal ──────┐
│ Your Signature   ✕ │              │ Your Signature        ✕ │
├────────────────────┤              ├─────────────────────────┤
│ [Draw] [Type] [⬆]  │              │ [Draw]  [Type]  [Upload]│
├────────────────────┤              ├─────────────────────────┤
│                    │              │                         │
│                    │              │    ┌─────────────────┐  │
│    Canvas          │              │    │  Canvas (400×   │  │
│    (full-width,    │              │    │   200px)        │  │
│     50vh min)      │              │    └─────────────────┘  │
│                    │              │                         │
│                    │              │  [ Clear ]  [ Undo ]    │
├────────────────────┤              ├─────────────────────────┤
│ [Clear] [Undo]     │              │     [Cancel]  [Apply]   │
│ [Cancel]  [Apply]  │              └─────────────────────────┘
└────────────────────┘
```

#### New Component: Pending Signatures Widget (owner dashboard)

**Files:** Create `apps/web/src/components/esign/pending-signatures-widget.tsx`

```typescript
interface PendingSignaturesWidgetProps {
  userId: string;
  communityId: number;
}
```

- Fetches pending signers for this user via a lightweight API call
- Card with count badge: "2 documents awaiting your signature"
- List items: document name, sender, sent date, "Sign Now" link
- Empty state: hidden (don't show an empty card if 0 pending)
- Position on dashboard: after announcements, before meetings

**Add to file summary:** 1 new component + 1 new API route (`GET /api/v1/esign/my-pending`) that returns pending submissions for the current user (scoped by `userId`, not community admin permissions).

### Accessibility Checklist (Ship Gate Addition)

Add to Section 10 (Ship Gate):

- [ ] **Keyboard-only signing**: entire signing flow completable with keyboard (Tab, Enter, Escape, arrow keys)
- [ ] **Screen reader signing**: VoiceOver/NVDA can navigate fields, hear progress, confirm submission
- [ ] **WCAG 2.5.7 compliance**: template builder field placement works via click-to-place (not drag-only)
- [ ] **Color + icon**: all status badges show icon alongside color
- [ ] **Focus management**: modal open/close moves/returns focus correctly
- [ ] **Touch targets**: all tappable elements ≥48px on mobile
- [ ] **Contrast**: all text meets 4.5:1, large text meets 3:1 (verified with axe DevTools)

### Additional Files (from audit findings)

| Action | Path | Source |
|--------|------|--------|
| **Create** | `apps/web/src/components/esign/pending-signatures-widget.tsx` | U14 |
| **Create** | `apps/web/src/app/api/v1/esign/my-pending/route.ts` | U14 |
| **Modify** | `apps/web/src/app/(authenticated)/dashboard/page.tsx` — add widget | U14 |
| **Modify** | `apps/web/src/components/mobile/BottomTabBar.tsx` — add E-Sign to More menu | U15 |

**Revised total: 29 new files, 9 modified files, 1 migration.**

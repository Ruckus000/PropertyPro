# E-Sign UX/UI Remediation — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Scope:** P0–P2 fixes from comprehensive esign UX/UI audit

## Context

A full UX/UI audit of the esign system identified 15 findings across P0–P2 severity.
This spec covers the 12 items scoped for remediation (3 P3 items deferred to backlog).

### Architectural Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Component replacement strategy | Hybrid: shadcn Dialog + Tabs for modal/tabs; shadcn Combobox for template selector | Dialog/Tabs are well-solved problems. Combobox approach reversed after estimating hand-rolled ARIA at 100-150 lines vs. free from shadcn. |
| `requestJson` extraction scope | Codebase-wide (all 9 hook files) | All copies are structurally identical. Fixing 3 while leaving 6 would be inconsistent. |
| `listSubmissions` filtering | WHERE clause for stored statuses; JS filter for expired only | Expired is a computed status (`expiresAt < now()`). Pushing it to SQL creates a second source of truth alongside `getEffectiveSubmissionStatus`. |
| `getAdmin() as any` | Descoped to TODO comment | Root cause is project-wide: `createAdminClient()` lacks generated Database types. Fixing it properly affects seed scripts, storage utils, and every admin-query service. Separate ticket. |

---

## Section 1: Shared Infrastructure

### 1a. Extract `requestJson` to shared utility

**File:** `apps/web/src/lib/api/request-json.ts` (new)

Extract the `requestJson<T>` function that is copy-pasted identically across 9 hook files.
All 9 copies verified identical — same signature, same error handling, same `data` extraction.

**Consumers (update imports, delete local copies):**
- `apps/web/src/hooks/use-esign-templates.ts`
- `apps/web/src/hooks/use-esign-submissions.ts`
- `apps/web/src/hooks/use-esign-signing.ts`
- `apps/web/src/hooks/use-visitors.ts`
- `apps/web/src/hooks/use-packages.ts`
- `apps/web/src/hooks/use-finance.ts`
- `apps/web/src/hooks/use-leases.ts`
- `apps/web/src/hooks/use-meetings.ts`
- `apps/web/src/hooks/use-arc.ts`

### 1b. Extract `ESIGN_STATUS_CONFIG` to shared constants

**File:** `apps/web/src/components/esign/esign-status-config.ts` (new)

Single `ESIGN_STATUS_CONFIG` record covering all statuses: `pending`, `processing`,
`processing_failed`, `completed`, `declined`, `expired`, `cancelled`, `opened`.
Also exports `EVENT_ICONS` map.

**Consumers:** `submission-list.tsx`, `submission-detail.tsx` — import from shared file,
delete local definitions.

---

## Section 2: P0 Fixes

### 2a. Expose `sendEmail` toggle + wire invitation emails

**UI change:** Add a Switch to the "Options" card (Step 3) in `NewSubmissionForm`, between
the signing order toggle and the expiration selector. Label: "Email signers". Helper text:
"Send signing invitation emails automatically when the request is created." Default: `true`.
Wire to `createMutation` payload.

**Service change (`esign-service.ts` → `createSubmission`):**
1. Look up sender's `fullName` from `users` table (1 query, needed for `senderName` prop).
   If `fullName` is null or empty, fall back to the user's email address for `senderName`.
2. After batch signer INSERT (see 4c), if `sendEmail: true`, loop through created signers
   and call `sendEmail()` with `EsignInvitationEmail` template
3. Email props (required): `signerName` (if signer has no `name`, fall back to their email
   address), `senderName` (from user lookup), `documentName`, `signingUrl` (constructed
   from slug). Optional: `expiresAt` (pass `undefined` if null, not `null`), `messageBody`
   (pass `undefined` if not provided).
4. Email failure for one signer must NOT abort the submission — wrap each send in try/catch,
   log failures, continue

**Security hardening:** Add `.max(50)` to the signers Zod array in the submissions POST route.
Bounds both the INSERT and email loop.

**Known limitation (documented):** Emails sent synchronously in loop. 10 signers ≈ 2-5s added
latency. Future optimization: background job queue. Not blocking for current scope.

### 2b. Replace SignatureCapture DIY modal with shadcn Dialog

Replace the outer `<div className="fixed inset-0 z-50">` + manual backdrop with
`<Dialog open onOpenChange>` + `<DialogContent>`.

**Gains:**
- `role="dialog"` + `aria-modal="true"`
- Radix focus trap (tab cycles within modal)
- Escape key closes
- `aria-labelledby` pointing to title
- Portal rendering

**Mobile:** Preserve bottom-sheet behavior via className overrides on `DialogContent`:
`items-end md:items-center` positioning, `rounded-t-2xl md:rounded-2xl` radius,
`h-[85vh] md:h-auto md:max-h-[80vh]` height.

Internal content (tabs, canvas, type input, upload, footer buttons) stays as-is.

### 2c. Push status filters to DB in `listSubmissions`

**Note:** The hook (`useEsignSubmissions`), API route, and service signature already accept
a `status` filter parameter and pass it through. The only change is inside `listSubmissions`
internals: replace JS-side filtering with a SQL WHERE clause.

**For stored statuses** (`completed`, `cancelled`, `declined`, `processing`, `processing_failed`):
```
where(eq(esignSubmissions.status, filterStatus))
```

**For `pending`** (which includes not-yet-expired submissions):
```
where(eq(esignSubmissions.status, 'pending'))
```

**For `expired`** (computed status — requires two-step approach):
```
// Step 1: Fetch pending rows with non-null expiresAt in the past
where(and(
  eq(esignSubmissions.status, 'pending'),
  isNotNull(esignSubmissions.expiresAt),
  lt(esignSubmissions.expiresAt, new Date())
))
// Step 2: Compute effectiveStatus via getEffectiveSubmissionStatus (preserves single source of truth)
// Return rows with effectiveStatus: 'expired' (same shape as the no-filter path)
```

**No filter** (default): fetch all rows, compute `effectiveStatus` for each (backward-compatible).

**No pagination.** Adding backend limit without frontend pagination controls would silently
truncate results. Deferred to separate ticket.

---

## Section 3: P1 Fixes

### 3a. shadcn Tabs for `EsignPageShell`

Replace custom tab buttons (lines 44-69) with shadcn `Tabs` / `TabsList` / `TabsTrigger` /
`TabsContent`. Provides `role="tablist"`, `role="tab"`, `aria-selected`, arrow-key navigation.

**Note:** The "Templates" tab is really navigation (shows a "Go to Templates" CTA card, not
inline content). Exclude it from the `Tabs` component entirely — render it as a standalone
nav link (`<Link>` styled as a tab) alongside the `TabsList`. This avoids an empty
`role="tabpanel"` that would violate ARIA semantics. The `Tabs` component wraps only the
"Documents" tab which has real inline content.

### 3b. shadcn Tabs for SignatureCapture internal tabs

Same treatment for Draw/Type/Upload tabs inside the Dialog. Replace hand-rolled tab buttons
(lines 177-197) with nested shadcn `Tabs`. Tab content panels stay as-is.

**Canvas lifecycle:** Current code unmounts canvas on tab switch (strokes lost). This is
pre-existing behavior, not a regression from the Tabs swap. Radix `TabsContent` unmounts
non-active content by default — same as the current `{activeTab === 'draw' && ...}` pattern.

### 3c. Normalize CSS to Tailwind utilities

Mechanical find-replace in `pdf-viewer.tsx`, `field-palette.tsx`, `field-overlay.tsx`:
- `text-[var(--text-tertiary)]` → `text-content-tertiary`
- `bg-[var(--surface-card)]` → `bg-surface-card`
- `text-[var(--status-danger)]` → `text-status-danger`
- `bg-[var(--interactive-primary)]` → `bg-interactive`
- `hover:bg-[var(--interactive-primary-hover)]` → `hover:bg-interactive-hover`
- `border-[var(--border-subtle)]` → `border-edge-subtle`
- `text-[var(--text-secondary)]` → `text-content-secondary`
- `bg-[var(--surface-subtle)]` → `bg-surface-subtle`
- `text-[var(--text-primary)]` → `text-content`
- `ring-[var(--interactive-primary)]` → `ring-interactive`

No behavioral change. Dialect consistency so codebase-wide searches find all usages.

### 3d. Replace `window.confirm()` with shadcn AlertDialog

In `submission-detail.tsx`, replace `window.confirm()` in `handleCancel` with shadcn
`AlertDialog`. Trigger: existing "Cancel Request" button. Content: same copy. Actions:
"Go back" (secondary) and "Cancel Request" (danger).

Mutation `isPending` disables the confirm button. Error handled inside the dialog.

**Prerequisite:** Install AlertDialog via shadcn CLI (`npx shadcn@latest add alert-dialog`).

### 3e. STATUS_CONFIG deduplication

Covered by Section 1b. Both `submission-list.tsx` and `submission-detail.tsx` import from
the shared `esign-status-config.ts` instead of defining their own.

---

## Section 4: P2 Fixes

### 4a. Skeleton loading states (inline)

Replace `<Loader2 className="animate-spin">` loading states with inline Skeleton JSX in:
- **Template list:** 3 card-shaped skeletons (title bar + description + badge area)
- **Submission list:** 5 table-row skeletons (name + status + date + actions)
- **Submission detail:** Document info card skeleton + signer list skeleton

No new files. Inline directly in the loading branch of each component. The `skeleton.tsx`
component already exists in `components/ui/`.

### 4b. shadcn Combobox for template selector

Replace the custom searchable dropdown in `NewSubmissionForm` with shadcn Combobox
(Popover + cmdk Command).

**Original plan was to hand-roll ARIA. Reversed after analysis:** Correct combobox ARIA
requires ~100-150 lines (aria-autocomplete, aria-controls, aria-activedescendant, arrow-key
with disabled-item skipping, Home/End, Escape, typeahead). shadcn Combobox provides all of
this for free. The current template selector IS a searchable dropdown — exactly what cmdk does.

**Template-specific requirements to preserve:**
- Disabled state for templates without PDFs (`aria-disabled` via cmdk's `disabled` prop)
- Description text below template name (custom `CommandItem` content)
- Search filtering by template name

### 4c. Batch signer INSERT

Replace `for...of` loop doing N individual `INSERT INTO esign_signers` with single
`db.insert(esignSigners).values(signersArray)`.

Slug generation moves to `.map()` building the values array before the INSERT.
Same transaction, same data. N round-trips → 1. Atomic (no partial signer creation possible).

### 4d. `getAdmin() as any` — descoped

Root cause: `createAdminClient()` in `packages/db/src/supabase/admin.ts` lacks generated
`Database` type parameter. Fixing this affects the entire codebase (seed scripts, storage
utils, every service doing admin queries).

**Action:** Add `// TODO: Generate Supabase Database types to remove this cast` comment.
Proper fix gets its own ticket.

---

## Section 5: Testing Strategy

### 5a. Service tests (`esign-service.test.ts`)

**`createSubmission` email wiring:**
- `sendEmail: true` → email service called once per signer with correct props
- `sendEmail: false` → email service NOT called
- User `fullName` lookup populates `senderName`
- Email failure for one signer does not abort submission creation
- Edge: signer with no `name` → fallback to email address

**`listSubmissions` WHERE clause:**
- Filter `pending` → pending + expired rows only
- Filter `completed` → no pending or cancelled rows
- Filter `expired` → only pending rows where `expiresAt < now()`
- No filter → all rows (backward-compatible)
- Edge: `expiresAt = null` + status `pending` → NOT in expired filter

**Batch INSERT:**
- N signers created with unique slugs in one operation
- All signers have correct `submissionId` FK

**Signer max:**
- 50 signers accepted (boundary)
- 51 signers rejected by Zod (boundary + 1)

### 5b. Shared utility test (`request-json.test.ts`, new)

**File:** `apps/web/src/lib/api/__tests__/request-json.test.ts`

- Successful response extracts `.data` field
- Error response throws with server message
- Error without message throws "Request failed"
- `data: undefined` throws "Missing response payload"
- Non-JSON response throws

### 5c. Component verification

**No new component test files.** Component changes (Dialog, Tabs, Combobox, AlertDialog)
use battle-tested Radix/shadcn primitives. Testing Radix internals via unit tests adds
maintenance cost without value.

**Verification approach:** Manual testing with preview tools during implementation —
keyboard navigation, focus trapping, ARIA attribute inspection.

**Hook test update:** `use-esign-submissions.test.tsx` may need adjustment now that the
`status` filter triggers SQL WHERE clauses instead of JS-side filtering. Verify mock
API responses reflect the narrower result sets returned by the updated query.

### 5d. Explicitly NOT tested

- CSS normalization (3c) — cosmetic, visual comparison during implementation
- STATUS_CONFIG extraction (1b) — moving constants between files, TypeScript catches mismatches
- AlertDialog swap (3d) — Radix AlertDialog tested upstream, we're just wiring it
- Inline skeletons (4a) — JSX with no logic

---

## Files Touched Summary

**New files (4):**
1. `apps/web/src/lib/api/request-json.ts`
2. `apps/web/src/lib/api/__tests__/request-json.test.ts`
3. `apps/web/src/components/esign/esign-status-config.ts`
4. `apps/web/src/components/ui/alert-dialog.tsx` (shadcn install)

**Modified files (~20):**
- 9 hook files (requestJson import swap)
- `apps/web/src/components/esign/new-submission-form.tsx` (sendEmail toggle + Combobox)
- `apps/web/src/lib/services/esign-service.ts` (email wiring + WHERE clause + batch INSERT + TODO comment)
- `apps/web/src/app/api/v1/esign/submissions/route.ts` (signer max + status passthrough)
- `apps/web/src/components/esign/signature-capture.tsx` (Dialog + Tabs)
- `apps/web/src/components/esign/esign-page-shell.tsx` (shadcn Tabs)
- `apps/web/src/components/esign/submission-list.tsx` (STATUS_CONFIG import + skeleton)
- `apps/web/src/components/esign/submission-detail.tsx` (STATUS_CONFIG import + AlertDialog + skeleton)
- `apps/web/src/components/esign/pdf-viewer.tsx` (CSS normalization + skeleton)
- `apps/web/src/components/esign/field-palette.tsx` (CSS normalization)
- `apps/web/src/components/esign/field-overlay.tsx` (CSS normalization)
- `apps/web/__tests__/esign/esign-service.test.ts` (new test cases)
- `apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx` (query param update)

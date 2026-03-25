# E-Sign UX/UI Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 12 verified UX/UI issues (P0–P2) in the esign system — wiring dead email toggle, replacing hand-rolled modals/tabs/dropdowns with shadcn primitives, normalizing CSS tokens, batching DB inserts, and adding proper loading states.

**Architecture:** Service-layer email wiring + SQL WHERE clauses in esign-service.ts. Component-level shadcn primitive swaps (Dialog, Tabs, Combobox, AlertDialog). Shared utility extraction (requestJson, STATUS_CONFIG). No schema changes. No new migrations.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / shadcn/ui (Radix) / Drizzle ORM / Vitest / @propertypro/email (Resend)

**Spec:** `docs/superpowers/specs/2026-03-25-esign-ux-remediation-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `apps/web/src/lib/api/request-json.ts` | Shared `requestJson<T>` utility for all hooks |
| `apps/web/src/lib/api/__tests__/request-json.test.ts` | Unit tests for the utility |
| `apps/web/src/components/esign/esign-status-config.ts` | Shared `ESIGN_STATUS_CONFIG` + `EVENT_ICONS` |
| `apps/web/src/components/ui/alert-dialog.tsx` | shadcn AlertDialog (installed via CLI) |

### Modified files
| File | Changes |
|---|---|
| 9 hook files (`use-esign-*.ts`, `use-visitors.ts`, etc.) | Import `requestJson` from shared, delete local copy |
| `apps/web/src/lib/services/esign-service.ts` | Email wiring in `createSubmission`, WHERE clause in `listSubmissions`, batch INSERT |
| `apps/web/src/app/api/v1/esign/submissions/route.ts` | Add `.max(50)` to signers Zod array |
| `apps/web/src/components/esign/new-submission-form.tsx` | sendEmail Switch + shadcn Combobox |
| `apps/web/src/components/esign/signature-capture.tsx` | shadcn Dialog wrap + shadcn Tabs |
| `apps/web/src/components/esign/esign-page-shell.tsx` | shadcn Tabs + Templates as nav link |
| `apps/web/src/components/esign/submission-list.tsx` | Import STATUS_CONFIG + inline skeleton |
| `apps/web/src/components/esign/submission-detail.tsx` | Import STATUS_CONFIG + AlertDialog + inline skeleton |
| `apps/web/src/components/esign/pdf-viewer.tsx` | CSS token normalization + inline skeleton |
| `apps/web/src/components/esign/field-palette.tsx` | CSS token normalization |
| `apps/web/src/components/esign/field-overlay.tsx` | CSS token normalization |
| `apps/web/__tests__/esign/esign-service.test.ts` | New test cases for email, WHERE, batch |
| `apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx` | Update mocks for SQL-side filtering |

---

## Task 1: Extract `requestJson` shared utility

**Files:**
- Create: `apps/web/src/lib/api/request-json.ts`
- Create: `apps/web/src/lib/api/__tests__/request-json.test.ts`
- Modify: 9 hook files (listed in spec Section 1a)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/api/__tests__/request-json.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestJson } from '../request-json';

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe('requestJson', () => {
  it('extracts .data from successful response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 1, name: 'test' } }),
    });
    const result = await requestJson<{ id: number; name: string }>('/api/test');
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('throws server error message on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Not found' } }),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Not found');
  });

  it('throws generic message when server provides no message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: {} }),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Request failed');
  });

  it('throws when data is undefined in response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    await expect(requestJson('/api/test')).rejects.toThrow('Missing response payload');
  });

  it('throws on non-JSON response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });
    await expect(requestJson('/api/test')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/api/__tests__/request-json.test.ts`
Expected: FAIL — module `../request-json` not found

- [ ] **Step 3: Create the shared utility**

Create `apps/web/src/lib/api/request-json.ts`:

```typescript
export async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  if (json.data === undefined) {
    throw new Error('Missing response payload');
  }
  return json.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/api/__tests__/request-json.test.ts`
Expected: 5 passing

- [ ] **Step 5: Update all 9 hook files**

In each file, replace the local `async function requestJson<T>(...)` definition with:
```typescript
import { requestJson } from '@/lib/api/request-json';
```

Files: `use-esign-templates.ts`, `use-esign-submissions.ts`, `use-esign-signing.ts`, `use-visitors.ts`, `use-packages.ts`, `use-finance.ts`, `use-leases.ts`, `use-meetings.ts`, `use-arc.ts`

- [ ] **Step 6: Run typecheck to verify all imports resolve**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api/request-json.ts apps/web/src/lib/api/__tests__/request-json.test.ts apps/web/src/hooks/
git commit -m "refactor: extract requestJson to shared utility

Eliminates 9 identical copies across hook files.
Single source of truth for API response parsing."
```

---

## Task 2: Extract `ESIGN_STATUS_CONFIG`

**Files:**
- Create: `apps/web/src/components/esign/esign-status-config.ts`
- Modify: `apps/web/src/components/esign/submission-list.tsx`
- Modify: `apps/web/src/components/esign/submission-detail.tsx`

- [ ] **Step 1: Read current status configs from both files**

Read the `STATUS_CONFIG` / status badge mapping from `submission-list.tsx` and `submission-detail.tsx`. Note the union of all statuses and their label/variant/icon mappings.

- [ ] **Step 2: Create the shared config file**

Create `apps/web/src/components/esign/esign-status-config.ts` with the merged superset of all status entries (`pending`, `processing`, `processing_failed`, `completed`, `declined`, `expired`, `cancelled`, `opened`) and the `EVENT_ICONS` map. Export both as named exports.

- [ ] **Step 3: Update submission-list.tsx**

Replace the local `STATUS_CONFIG` definition with:
```typescript
import { ESIGN_STATUS_CONFIG } from './esign-status-config';
```
Update all references from `STATUS_CONFIG` to `ESIGN_STATUS_CONFIG`.

- [ ] **Step 4: Update submission-detail.tsx**

Same import swap. Also import `EVENT_ICONS` if used locally.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/esign/esign-status-config.ts apps/web/src/components/esign/submission-list.tsx apps/web/src/components/esign/submission-detail.tsx
git commit -m "refactor: extract ESIGN_STATUS_CONFIG to shared file

Single source of truth for esign status labels, variants, and icons."
```

---

## Task 3: Signer max validation + batch INSERT

**Files:**
- Modify: `apps/web/src/app/api/v1/esign/submissions/route.ts`
- Modify: `apps/web/src/lib/services/esign-service.ts`
- Modify: `apps/web/__tests__/esign/esign-service.test.ts`

- [ ] **Step 1: Write failing test for signer max (route-level)**

In the existing test file or a new route test, verify that a payload with 51 signers is rejected. The Zod schema runs at the route level, so this is a validation test.

Add to `esign-service.test.ts` — but since Zod validation happens in the route, not the service, this test verifies the service-level batch behavior instead.

- [ ] **Step 2: Write failing test for batch INSERT**

Add to `esign-service.test.ts`:

```typescript
describe('createSubmission - batch signer INSERT', () => {
  it('calls insert once for multiple signers (batch)', async () => {
    const scoped = makeScopedMock({
      status: 'active',
      fieldsSchema: validFieldsSchema(),
      sourceDocumentPath: 'docs/test.pdf',
      signing_order: 'parallel',
    });
    createScopedClientMock.mockReturnValue(scoped);

    await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [
        { email: 'a@test.com', name: 'A', role: 'signer', sortOrder: 0 },
        { email: 'b@test.com', name: 'B', role: 'signer', sortOrder: 1 },
        { email: 'c@test.com', name: 'C', role: 'signer', sortOrder: 2 },
      ],
      signingOrder: 'parallel',
      sendEmail: false,
    });

    // insert called: once for submission, once for all signers (batch), once for event
    const insertCalls = scoped.insert.mock.calls;
    // The signers insert should receive an array of 3 objects
    const signerInsertCall = insertCalls.find(
      (call: unknown[]) => Array.isArray(call[1]) && call[1].length === 3
    );
    expect(signerInsertCall).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "batch"`
Expected: FAIL — current code calls insert per signer, not batch

- [ ] **Step 4: Add .max(50) to route Zod schema**

In `apps/web/src/app/api/v1/esign/submissions/route.ts`, line 32, change:
```typescript
// Before
).min(1),
// After
).min(1).max(50),
```

- [ ] **Step 5: Convert signer INSERT loop to batch**

In `apps/web/src/lib/services/esign-service.ts`, replace lines 642-658 with:

```typescript
  const signerValues = input.signers.map((signerInput) => ({
    communityId,
    submissionId: submission.id,
    externalId: generateExternalId(),
    userId: signerInput.userId ?? null,
    email: signerInput.email,
    name: signerInput.name,
    role: signerInput.role,
    slug: generateSigningSlug(),
    sortOrder: signerInput.sortOrder,
    status: 'pending' as const,
    prefilledFields: signerInput.prefilledFields ?? null,
  }));

  const signerRecords = (await scoped.insert(esignSigners, signerValues)) as EsignSignerRecord[];
```

Note: `scoped.insert` already accepts an array — verify this by checking `packages/db/src/scoped-client.ts`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "batch"`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts`
Expected: All existing tests still pass

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/esign/submissions/route.ts apps/web/src/lib/services/esign-service.ts apps/web/__tests__/esign/esign-service.test.ts
git commit -m "perf: batch signer INSERT + add .max(50) signer limit

Replaces N individual INSERT calls with a single batch insert.
Adds Zod validation cap at 50 signers to bound email + DB load."
```

---

## Task 4: Wire invitation emails in `createSubmission`

**Files:**
- Modify: `apps/web/src/lib/services/esign-service.ts`
- Modify: `apps/web/__tests__/esign/esign-service.test.ts`

- [ ] **Step 1: Write failing tests for email wiring**

Add to `esign-service.test.ts`. First, add `esignInvitationEmailMock` to the hoisted mocks:

```typescript
// Add to vi.hoisted block:
esignInvitationEmailMock: vi.fn(() => ({ type: 'EsignInvitationEmail' })),
```

Update the `@propertypro/email` mock:
```typescript
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  EsignReminderEmail: esignReminderEmailMock,
  EsignInvitationEmail: esignInvitationEmailMock,
}));
```

Add a `users` table mock for the sender name lookup. The service uses `getAdmin()` → `.from('users').select('full_name, email')`. Mock the admin client chain:

```typescript
// In beforeEach or per-test setup:
createAdminClientMock.mockReturnValue({
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { full_name: 'Jane Admin', email: 'jane@test.com' },
          error: null,
        }),
      }),
    }),
  }),
});
```

Then add the tests:

```typescript
describe('createSubmission - invitation emails', () => {
  it('sends invitation emails when sendEmail is true', async () => {
    // setup scoped mock with template that has valid fields
    const scoped = makeScopedMock({ /* template fields */ });
    createScopedClientMock.mockReturnValue(scoped);

    await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [
        { email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 },
      ],
      signingOrder: 'parallel',
      sendEmail: true,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(esignInvitationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signerName: 'Alice',
        senderName: 'Jane Admin',
      }),
    );
  });

  it('does NOT send emails when sendEmail is false', async () => {
    const scoped = makeScopedMock({ /* template fields */ });
    createScopedClientMock.mockReturnValue(scoped);

    await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [{ email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 }],
      signingOrder: 'parallel',
      sendEmail: false,
    });

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('continues creating submission when email fails', async () => {
    const scoped = makeScopedMock({ /* template fields */ });
    createScopedClientMock.mockReturnValue(scoped);
    sendEmailMock.mockRejectedValueOnce(new Error('SMTP failure'));

    const result = await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [{ email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 }],
      signingOrder: 'parallel',
      sendEmail: true,
    });

    // Submission still created despite email failure
    expect(result.submission).toBeDefined();
    expect(result.signers).toHaveLength(1);
  });

  it('falls back to email when signer has no name', async () => {
    // Signer name comes from input, which Zod requires .min(1) — but the
    // fallback is still documented for robustness
    const scoped = makeScopedMock({ /* template fields */ });
    createScopedClientMock.mockReturnValue(scoped);

    await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [{ email: 'a@test.com', name: '', role: 'signer', sortOrder: 0 }],
      signingOrder: 'parallel',
      sendEmail: true,
    });

    // Note: Zod .min(1) would normally reject empty name at the route level.
    // This tests the service-level fallback for defense-in-depth.
    expect(esignInvitationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ signerName: 'a@test.com' }),
    );
  });

  it('falls back to email when sender fullName is null', async () => {
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: null, email: 'jane@test.com' },
              error: null,
            }),
          }),
        }),
      }),
    });

    const scoped = makeScopedMock({ /* template fields */ });
    createScopedClientMock.mockReturnValue(scoped);

    await createSubmission(1, 'user-uuid', {
      templateId: 1,
      signers: [{ email: 'a@test.com', name: 'Alice', role: 'signer', sortOrder: 0 }],
      signingOrder: 'parallel',
      sendEmail: true,
    });

    expect(esignInvitationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ senderName: 'jane@test.com' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "invitation"`
Expected: FAIL — sendEmail never called

- [ ] **Step 3: Implement email wiring**

In `apps/web/src/lib/services/esign-service.ts`:

1. Update the import:
```typescript
import { EsignInvitationEmail, EsignReminderEmail, sendEmail } from '@propertypro/email';
```

2. After the batch signer INSERT and before the event INSERT, add:

```typescript
  // --- Send invitation emails (fire-and-forget per signer) ---
  if (input.sendEmail && signerRecords.length > 0) {
    const admin = getAdmin();

    // Look up sender name (same pattern as sendReminder ~line 932)
    const { data: senderRow } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();
    const senderName = senderRow?.full_name || senderRow?.email || 'PropertyPro';

    // Look up community name (same pattern as sendReminder ~line 933-941)
    const { data: communityRows } = await admin
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .limit(1);
    const communityName = (communityRows?.[0] as { name?: string } | undefined)?.name ?? 'PropertyPro';

    const documentName = submission.messageSubject ?? template.name;

    for (const signer of signerRecords) {
      try {
        const signingUrl = buildSigningUrl(submission.externalId, signer.slug);
        await sendEmail({
          to: signer.email,
          subject: `Signature requested: ${documentName}`,
          category: 'transactional',
          react: EsignInvitationEmail({
            branding: { communityName },
            signerName: signer.name || signer.email,
            senderName,
            documentName,
            signingUrl,
            expiresAt: input.expiresAt ?? undefined,
            messageBody: input.messageBody ?? undefined,
          }),
        });
      } catch (err) {
        console.error(`Failed to send invitation email to ${signer.email}:`, err);
        // Continue — email failure must not abort submission creation
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "invitation"`
Expected: All 5 passing

- [ ] **Step 5: Run full esign test suite**

Run: `pnpm exec vitest run apps/web/__tests__/esign/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/esign-service.ts apps/web/__tests__/esign/esign-service.test.ts
git commit -m "feat: wire invitation emails in createSubmission

Sends EsignInvitationEmail per signer when sendEmail=true.
Email failures are caught and logged — never abort submission.
Sender name resolved from users table with email fallback."
```

---

## Task 5: Push status filters to SQL in `listSubmissions`

**Files:**
- Modify: `apps/web/src/lib/services/esign-service.ts`
- Modify: `apps/web/__tests__/esign/esign-service.test.ts`

- [ ] **Step 1: Write failing tests for WHERE clause filtering**

Add to `esign-service.test.ts`:

```typescript
describe('listSubmissions - SQL filtering', () => {
  it('passes WHERE clause for stored statuses', async () => {
    const scoped = makeScopedMock();
    scoped.selectFrom = vi.fn(async () => []);
    createScopedClientMock.mockReturnValue(scoped);

    await listSubmissions(1, { status: 'completed' });

    // selectFrom should receive a WHERE condition (3rd argument)
    expect(scoped.selectFrom).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ type: 'eq' }),
    );
  });

  it('fetches all rows when no filter provided', async () => {
    const scoped = makeScopedMock();
    scoped.selectFrom = vi.fn(async () => []);
    createScopedClientMock.mockReturnValue(scoped);

    await listSubmissions(1);

    // selectFrom should NOT receive a WHERE condition
    expect(scoped.selectFrom).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
  });

  it('filters expired from pending rows with past expiresAt', async () => {
    const scoped = makeScopedMock();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    scoped.selectFrom = vi.fn(async () => [
      { id: 1, status: 'pending', expiresAt: pastDate, communityId: 1 },
      { id: 2, status: 'pending', expiresAt: null, communityId: 1 },
    ]);
    createScopedClientMock.mockReturnValue(scoped);

    const results = await listSubmissions(1, { status: 'expired' });

    // Only the row with past expiresAt should be returned
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(1);
  });

  it('does not include pending rows with null expiresAt in expired filter', async () => {
    const scoped = makeScopedMock();
    scoped.selectFrom = vi.fn(async () => [
      { id: 1, status: 'pending', expiresAt: null, communityId: 1 },
    ]);
    createScopedClientMock.mockReturnValue(scoped);

    const results = await listSubmissions(1, { status: 'expired' });
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "SQL filtering"`
Expected: FAIL — current code fetches all rows with no WHERE

- [ ] **Step 3: Implement WHERE clause logic**

Replace the `listSubmissions` function body (lines 680-693) with:

```typescript
export async function listSubmissions(
  communityId: number,
  filters?: { status?: EsignSubmissionStatus },
): Promise<EsignSubmissionRecord[]> {
  const scoped = createScopedClient(communityId);

  // Expired is a computed status — special handling
  if (filters?.status === 'expired') {
    const rows = (await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.status, 'pending'),
    )) as EsignSubmissionRecord[];
    return rows
      .map((row) => withEffectiveStatus(row))
      .filter((row) => row.effectiveStatus === 'expired');
  }

  // Stored statuses get pushed to SQL
  if (filters?.status) {
    const rows = (await scoped.selectFrom(
      esignSubmissions,
      {},
      eq(esignSubmissions.status, filters.status),
    )) as EsignSubmissionRecord[];
    return rows.map((row) => withEffectiveStatus(row));
  }

  // No filter — fetch all, compute effectiveStatus
  const rows = (await scoped.selectFrom(esignSubmissions, {})) as EsignSubmissionRecord[];
  return rows.map((row) => withEffectiveStatus(row));
}
```

Need to import `eq` from `@propertypro/db/filters` — check if it's already imported at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/__tests__/esign/esign-service.test.ts -t "SQL filtering"`
Expected: All 4 passing

- [ ] **Step 5: Run full esign test suite**

Run: `pnpm exec vitest run apps/web/__tests__/esign/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/esign-service.ts apps/web/__tests__/esign/esign-service.test.ts
git commit -m "perf: push status filters to SQL in listSubmissions

Stored statuses now use WHERE clause instead of JS filter.
Expired filter still uses JS-side computation (single source of truth).
No-filter path unchanged (backward-compatible)."
```

---

## Task 6: sendEmail toggle in NewSubmissionForm

**Files:**
- Create: `apps/web/src/components/ui/switch.tsx` (via shadcn CLI)
- Modify: `apps/web/src/components/esign/new-submission-form.tsx`

- [ ] **Step 1: Install shadcn Switch**

Run: `npx shadcn@latest add switch`
Verify: `apps/web/src/components/ui/switch.tsx` was created.

- [ ] **Step 2: Read the current Options card (Step 3) section**

Read `new-submission-form.tsx` and locate the Options card. Identify the signing order toggle and expiration selector to find the insertion point.

- [ ] **Step 3: Add sendEmail Switch**

After the signing order toggle and before the expiration selector, add:

```tsx
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="sendEmail">Email signers</Label>
    <p className="text-sm text-content-secondary">
      Send signing invitation emails automatically when the request is created.
    </p>
  </div>
  <Switch
    id="sendEmail"
    checked={form.sendEmail}
    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, sendEmail: checked }))}
  />
</div>
```

Verify the form state initialization includes `sendEmail: true` (the new default).

- [ ] **Step 4: Verify the mutation payload passes sendEmail through**

Check that the `createMutation` call already includes `sendEmail: form.sendEmail` in its payload. If not, add it.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/esign/new-submission-form.tsx
git commit -m "feat: add sendEmail toggle to submission form

Defaults to true. Wired to createSubmission payload."
```

---

## Task 7: shadcn Combobox for template selector

**Files:**
- Modify: `apps/web/src/components/esign/new-submission-form.tsx`

- [ ] **Step 1: Read the current template selector**

Read `new-submission-form.tsx` and identify the custom dropdown for template selection. Note how it handles search, disabled items (templates without PDFs), and the description text.

- [ ] **Step 2: Replace with shadcn Combobox (Popover + Command)**

The project already has `command.tsx` (cmdk) installed. Import `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover` and `Command`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList` from `@/components/ui/command`.

Replace the custom dropdown with:

```tsx
<Popover open={templateOpen} onOpenChange={setTemplateOpen}>
  <PopoverTrigger asChild>
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={templateOpen}
      className="w-full justify-between"
    >
      {selectedTemplate?.name ?? 'Select a template...'}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0" align="start">
    <Command>
      <CommandInput placeholder="Search templates..." />
      <CommandList>
        <CommandEmpty>No templates found.</CommandEmpty>
        <CommandGroup>
          {templates.map((t) => (
            <CommandItem
              key={t.id}
              value={t.name}
              disabled={!t.sourceDocumentPath}
              onSelect={() => {
                setForm((prev) => ({ ...prev, templateId: t.id }));
                setTemplateOpen(false);
              }}
            >
              <div>
                <div className="font-medium">{t.name}</div>
                {t.description && (
                  <div className="text-sm text-content-secondary">{t.description}</div>
                )}
              </div>
              {!t.sourceDocumentPath && (
                <span className="ml-auto text-xs text-content-disabled">No PDF</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Add `const [templateOpen, setTemplateOpen] = useState(false);` to component state.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/esign/new-submission-form.tsx
git commit -m "a11y: replace custom template dropdown with shadcn Combobox

Full keyboard navigation, ARIA roles, and disabled-item support
via cmdk. Preserves search, description text, and PDF requirement."
```

---

## Task 8: shadcn Dialog for SignatureCapture

**Files:**
- Modify: `apps/web/src/components/esign/signature-capture.tsx`

- [ ] **Step 1: Read the current modal markup**

Read `signature-capture.tsx`. Identify the outer `<div className="fixed inset-0 z-50">` wrapper, the backdrop, and the content panel. Note the mobile bottom-sheet positioning.

- [ ] **Step 2: Replace with shadcn Dialog**

Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`.

Replace the outer `<div className="fixed inset-0 z-50">` + backdrop with:

```tsx
<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
  <DialogContent className="flex flex-col items-end md:items-center max-w-lg rounded-t-2xl md:rounded-2xl h-[85vh] md:h-auto md:max-h-[80vh] p-0 gap-0">
    <DialogHeader className="px-6 pt-6 pb-4 w-full">
      <DialogTitle>Add Your Signature</DialogTitle>
    </DialogHeader>
    {/* existing tab content and footer stay as-is */}
  </DialogContent>
</Dialog>
```

Remove the manual backdrop div and the outer fixed-position wrapper.

- [ ] **Step 3: Replace internal tabs with shadcn Tabs**

Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`.

Replace the Draw/Type/Upload button group with:

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="w-full">
    <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
    <TabsTrigger value="type" className="flex-1">Type</TabsTrigger>
    <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
  </TabsList>
  <TabsContent value="draw">
    {/* existing canvas content */}
  </TabsContent>
  <TabsContent value="type">
    {/* existing type input content */}
  </TabsContent>
  <TabsContent value="upload">
    {/* existing upload content */}
  </TabsContent>
</Tabs>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/esign/signature-capture.tsx
git commit -m "a11y: wrap SignatureCapture in shadcn Dialog + Tabs

Adds focus trap, aria-modal, aria-labelledby, keyboard nav.
Preserves mobile bottom-sheet behavior via DialogContent overrides."
```

---

## Task 9: shadcn Tabs for EsignPageShell

**Files:**
- Modify: `apps/web/src/components/esign/esign-page-shell.tsx`

- [ ] **Step 1: Read the current tab buttons**

Read `esign-page-shell.tsx`. Identify the custom tab buttons (lines ~44-69) and the conditional rendering below.

- [ ] **Step 2: Replace Documents tab with shadcn Tabs, Templates as nav link**

Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`.

The Documents tab becomes a real `Tabs` component. The Templates link sits alongside the `TabsList` as a styled `<Link>`:

```tsx
<div className="flex items-center gap-2">
  <Tabs defaultValue="documents" className="flex-1">
    <TabsList>
      <TabsTrigger value="documents">Documents</TabsTrigger>
    </TabsList>
    <TabsContent value="documents">
      <SubmissionList communityId={communityId} />
    </TabsContent>
  </Tabs>
  <Link
    href={`/esign/templates?communityId=${communityId}`}
    className={cn(
      'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
      'text-content-secondary hover:text-content hover:bg-surface-subtle transition-colors',
    )}
  >
    <LayoutTemplate className="h-4 w-4" />
    Templates
  </Link>
</div>
```

Remove the old `activeTab` state and conditional rendering.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/esign/esign-page-shell.tsx
git commit -m "a11y: replace custom tabs with shadcn Tabs in EsignPageShell

Documents tab gets proper ARIA semantics.
Templates rendered as nav link (not a tab — it navigates away)."
```

---

## Task 10: Install AlertDialog + replace window.confirm()

**Files:**
- Create: `apps/web/src/components/ui/alert-dialog.tsx` (via shadcn CLI)
- Modify: `apps/web/src/components/esign/submission-detail.tsx`

- [ ] **Step 1: Install shadcn AlertDialog**

Run: `npx shadcn@latest add alert-dialog`

Verify `apps/web/src/components/ui/alert-dialog.tsx` was created.

- [ ] **Step 2: Read the current window.confirm() usage**

Read `submission-detail.tsx` and locate the `handleCancel` function with `window.confirm()`.

- [ ] **Step 3: Replace with AlertDialog**

Add state: `const [cancelDialogOpen, setCancelDialogOpen] = useState(false);`

Replace the "Cancel Request" button click to open the dialog:
```tsx
<Button variant="outline" onClick={() => setCancelDialogOpen(true)}>
  Cancel Request
</Button>
```

Add the AlertDialog component:
```tsx
<AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Cancel signing request?</AlertDialogTitle>
      <AlertDialogDescription>
        All pending signatures will be voided. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Go back</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => cancelMutation.mutate(submissionId)}
        disabled={cancelMutation.isPending}
        className="bg-status-danger hover:bg-status-danger/90"
      >
        {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Request'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Remove the `window.confirm()` call from `handleCancel`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/alert-dialog.tsx apps/web/src/components/esign/submission-detail.tsx
git commit -m "a11y: replace window.confirm with shadcn AlertDialog

Styled, non-blocking confirmation with proper focus management.
Danger variant button for destructive cancel action."
```

---

## Task 11: CSS token normalization

**Files:**
- Modify: `apps/web/src/components/esign/pdf-viewer.tsx`
- Modify: `apps/web/src/components/esign/field-palette.tsx`
- Modify: `apps/web/src/components/esign/field-overlay.tsx`

- [ ] **Step 1: Find and replace in pdf-viewer.tsx**

Read the file. Find all `[var(--...)]` patterns and replace with semantic Tailwind utilities per the mapping in the spec (Section 3c). The key mappings verified against `tailwind.config.ts`:

| Pattern | Replacement |
|---|---|
| `text-[var(--text-primary)]` | `text-content` |
| `text-[var(--text-secondary)]` | `text-content-secondary` |
| `text-[var(--text-tertiary)]` | `text-content-tertiary` |
| `bg-[var(--surface-card)]` | `bg-surface-card` |
| `bg-[var(--surface-subtle)]` | `bg-surface-subtle` |
| `bg-[var(--interactive-primary)]` | `bg-interactive` |
| `hover:bg-[var(--interactive-primary-hover)]` | `hover:bg-interactive-hover` |
| `text-[var(--status-danger)]` | `text-status-danger` |
| `border-[var(--border-subtle)]` | `border-edge-subtle` |
| `ring-[var(--interactive-primary)]` | `ring-interactive` |

- [ ] **Step 2: Find and replace in field-palette.tsx**

Same mapping. Read file, replace all instances.

- [ ] **Step 3: Find and replace in field-overlay.tsx**

Same mapping. Read file, replace all instances.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/esign/pdf-viewer.tsx apps/web/src/components/esign/field-palette.tsx apps/web/src/components/esign/field-overlay.tsx
git commit -m "style: normalize CSS vars to semantic Tailwind utilities

Replaces arbitrary [var(--token)] syntax with config-defined classes.
No visual change — same underlying CSS variables."
```

---

## Task 12: Inline skeleton loading states

**Files:**
- Modify: `apps/web/src/components/esign/submission-list.tsx`
- Modify: `apps/web/src/components/esign/submission-detail.tsx`
- Modify: `apps/web/src/components/esign/pdf-viewer.tsx`

- [ ] **Step 1: Read each component's loading branch**

Read the loading state in each file. Identify where `<Loader2 className="animate-spin">` or similar spinners are used.

- [ ] **Step 2: Replace with inline Skeleton JSX in submission-list.tsx**

Import `{ Skeleton }` from `@/components/ui/skeleton`.

Replace the spinner with table-row skeletons:

```tsx
// Loading state
<div className="space-y-3">
  {Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="flex items-center gap-4 p-4">
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-6 w-[80px] rounded-full" />
      <Skeleton className="h-4 w-[100px]" />
      <Skeleton className="h-8 w-8 rounded-md ml-auto" />
    </div>
  ))}
</div>
```

- [ ] **Step 3: Replace with inline Skeleton JSX in submission-detail.tsx**

```tsx
// Loading state
<div className="space-y-6">
  <div className="rounded-lg border border-edge p-6 space-y-4">
    <Skeleton className="h-6 w-[250px]" />
    <Skeleton className="h-4 w-[180px]" />
    <div className="flex gap-3">
      <Skeleton className="h-6 w-[80px] rounded-full" />
      <Skeleton className="h-6 w-[100px] rounded-full" />
    </div>
  </div>
  <div className="rounded-lg border border-edge p-6 space-y-3">
    <Skeleton className="h-5 w-[120px]" />
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-[180px]" />
        <Skeleton className="h-6 w-[70px] rounded-full ml-auto" />
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Replace with inline Skeleton JSX in pdf-viewer.tsx (if applicable)**

Check if pdf-viewer has its own loading state or if it relies on a parent. If it has a loading spinner, replace with a document-shaped skeleton.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/esign/submission-list.tsx apps/web/src/components/esign/submission-detail.tsx apps/web/src/components/esign/pdf-viewer.tsx
git commit -m "ux: replace loading spinners with skeleton states

Inline skeletons matching each component's content shape.
No new files — uses existing Skeleton component."
```

---

## Task 13: Update hook test for SQL-side filtering

**Files:**
- Modify: `apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx`

- [ ] **Step 1: Read the existing hook test**

Read `apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx`. Identify any tests that:
- Mock API responses returning all submissions and assert client-side filter behavior
- Assert the fetch URL includes or excludes `status` query params

- [ ] **Step 2: Update mocks for SQL-side filtering**

Now that `listSubmissions` filters at the SQL level, the API endpoint returns pre-filtered results. Update any test mocks that returned a full set of submissions (expecting JS-side filtering) to instead return only the rows matching the filter.

For example, if a test mocked `GET /api/v1/esign/submissions?status=completed` and returned both pending and completed rows expecting JS to filter, update the mock to return only completed rows.

- [ ] **Step 3: Run the hook test**

Run: `pnpm exec vitest run apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/__tests__/use-esign-submissions.test.tsx
git commit -m "test: update hook test for SQL-side submission filtering"
```

---

## Task 14: Add TODO comment for `getAdmin() as any`

**Files:**
- Modify: `apps/web/src/lib/services/esign-service.ts`

- [ ] **Step 1: Add TODO comment**

At the `getAdmin()` function (line ~414), replace the comment:

```typescript
/**
 * Returns an untyped admin Supabase client.
 * TODO: Generate Supabase Database types and pass to createAdminClient<Database>()
 * to remove this `as any` cast. Affects all admin client consumers project-wide.
 */
function getAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/services/esign-service.ts
git commit -m "docs: add TODO for getAdmin() type safety

Root cause is project-wide: createAdminClient lacks Database types.
Tracked separately from esign remediation."
```

---

## Task 15: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: No new errors (existing warnings may remain)

- [ ] **Step 3: Run all esign tests**

Run: `pnpm exec vitest run apps/web/__tests__/esign/`
Expected: All passing

- [ ] **Step 4: Run the requestJson test**

Run: `pnpm exec vitest run apps/web/src/lib/api/__tests__/request-json.test.ts`
Expected: 5 passing

- [ ] **Step 5: Run full unit test suite**

Run: `pnpm test`
Expected: No regressions

- [ ] **Step 6: Build check**

Run: `pnpm build`
Expected: Successful build

- [ ] **Step 7: Manual verification with preview tools**

Start dev server, log in as `cam` role, navigate to `/esign`:
- Verify sendEmail toggle appears in new submission form
- Verify template Combobox works with keyboard (arrow keys, enter, escape)
- Verify Documents tab has proper ARIA (`role="tab"`, `aria-selected`)
- Verify Templates shows as a nav link, not a tab
- Verify SignatureCapture modal traps focus (Tab key cycles within)
- Verify AlertDialog appears for cancel (not browser confirm)
- Verify skeleton loading states appear briefly on page load

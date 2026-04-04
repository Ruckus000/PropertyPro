# Audit Trail Logging Fix + Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compliance Recent Activity entries descriptive ("linked a document — Current Insurance Policies") instead of generic ("update — 1-condo"), and clean up a redundant prop from the prior audit remediation.

**Architecture:** Add 4 compliance actions to the `AuditAction` type, swap the hardcoded `'update'` in the PATCH endpoint to use the specific action + item title metadata, remove redundant `itemTitle` prop from `ComplianceItemActions`, and add a clarifying comment to the activity feed dedup.

**Tech Stack:** TypeScript, Drizzle ORM audit logger, Next.js API route, React components.

---

## File Map

| Task | File | Action |
|------|------|--------|
| 1 | `packages/db/src/utils/audit-logger.ts` | Modify: add 4 actions to `AuditAction` type |
| 1 | `apps/web/src/app/api/v1/compliance/route.ts` | Modify: use specific action + metadata |
| 2 | `apps/web/src/components/compliance/compliance-item-actions.tsx` | Modify: remove `itemTitle` prop, use `item.title` |
| 2 | `apps/web/src/components/compliance/compliance-dashboard.tsx` | Modify: remove `itemTitle={item.title}` from call site |
| 3 | `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Modify: add clarifying comment |

---

### Task 1: Fix Audit Trail Logging to Use Specific Actions

**Files:**
- Modify: `packages/db/src/utils/audit-logger.ts:12-44`
- Modify: `apps/web/src/app/api/v1/compliance/route.ts:295-302`

- [ ] **Step 1: Add compliance actions to AuditAction type**

In `packages/db/src/utils/audit-logger.ts`, find line 44 (the end of the `AuditAction` type, currently ending with `| 'support_consent_granted' | 'support_consent_revoked';`).

Replace:

```ts
  | 'support_consent_granted' | 'support_consent_revoked';
```

With:

```ts
  | 'support_consent_granted' | 'support_consent_revoked'
  // Compliance checklist audit actions
  | 'link_document' | 'unlink_document'                          // Document linking
  | 'mark_not_applicable' | 'mark_applicable';                   // Applicability toggling
```

- [ ] **Step 2: Update the compliance PATCH endpoint's logAuditEvent call**

In `apps/web/src/app/api/v1/compliance/route.ts`, find lines 295-302:

```ts
  await logAuditEvent({
    userId,
    action: 'update',
    resourceType: 'compliance_checklist_item',
    resourceId: String(id),
    communityId,
    newValues: { action: patchAction, documentId: documentId ?? null },
  });
```

Replace with:

```ts
  await logAuditEvent({
    userId,
    action: patchAction,
    resourceType: 'compliance_checklist_item',
    resourceId: String(id),
    communityId,
    metadata: { itemTitle: row['title'] as string },
    newValues: { documentId: documentId ?? null },
  });
```

Two changes: `action` uses `patchAction` (already Zod-validated as one of `'link_document' | 'unlink_document' | 'mark_not_applicable' | 'mark_applicable'`), and `metadata` includes the item title for the activity feed display.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`

Expected: all 13 tasks pass. The key check is that `patchAction` is assignable to `AuditAction` now that the 4 values are in the union.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/utils/audit-logger.ts apps/web/src/app/api/v1/compliance/route.ts
git commit -m "fix: log specific compliance actions instead of generic 'update'

Adds link_document, unlink_document, mark_not_applicable, mark_applicable
to AuditAction type and uses them in the compliance PATCH endpoint.
Includes itemTitle in metadata for descriptive activity feed entries."
```

---

### Task 2: Remove Redundant itemTitle Prop from ComplianceItemActions

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-item-actions.tsx:8-26`
- Modify: `apps/web/src/components/compliance/compliance-dashboard.tsx:363-365`

- [ ] **Step 1: Remove itemTitle from props and use item.title directly**

In `apps/web/src/components/compliance/compliance-item-actions.tsx`, replace the interface and destructuring (lines 8-26):

```ts
interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  itemTitle: string;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}

export function ComplianceItemActions({
  item,
  itemTitle,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
```

With:

```ts
interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}

export function ComplianceItemActions({
  item,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
```

Then replace all `itemTitle` references in the aria-labels with `item.title`. There are 6 occurrences:

- `aria-label={`Mark ${itemTitle} as applicable`}` → `aria-label={`Mark ${item.title} as applicable`}`
- `aria-label={`Unlink document from ${itemTitle}`}` → `aria-label={`Unlink document from ${item.title}`}`
- `aria-label={`View document for ${itemTitle}`}` → `aria-label={`View document for ${item.title}`}`
- `aria-label={`Mark ${itemTitle} as not applicable`}` → `aria-label={`Mark ${item.title} as not applicable`}`
- `aria-label={`Link existing document to ${itemTitle}`}` → `aria-label={`Link existing document to ${item.title}`}`
- `aria-label={`Upload document for ${itemTitle}`}` → `aria-label={`Upload document for ${item.title}`}`

- [ ] **Step 2: Remove itemTitle from the call site**

In `apps/web/src/components/compliance/compliance-dashboard.tsx`, find lines 363-365:

```tsx
      <ComplianceItemActions
        item={item}
        itemTitle={item.title}
```

Replace with:

```tsx
      <ComplianceItemActions
        item={item}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`

Expected: all tasks pass. TypeScript will catch any remaining references to `itemTitle`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/compliance/compliance-item-actions.tsx apps/web/src/components/compliance/compliance-dashboard.tsx
git commit -m "refactor: remove redundant itemTitle prop from ComplianceItemActions

Use item.title directly in aria-labels. The component already receives
the full item object — the separate prop was unnecessary indirection."
```

---

### Task 3: Add Clarifying Comment to Activity Feed Dedup

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-activity-feed.tsx:103`

- [ ] **Step 1: Add comment above the useMemo**

In `apps/web/src/components/compliance/compliance-activity-feed.tsx`, find line 103:

```ts
  const entries = React.useMemo(() => {
```

Add a comment above it:

```ts
  // Defensive: deduplicate by ID in case the API ever returns duplicate rows.
  // The "duplicate-looking" entries in Recent Activity were caused by all actions
  // being logged as generic 'update' — fixed in the compliance PATCH endpoint.
  const entries = React.useMemo(() => {
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/compliance-activity-feed.tsx
git commit -m "docs: add clarifying comment to activity feed dedup useMemo"
```

# Audit Trail Logging Fix + Cleanup

## Problem

The compliance PATCH endpoint logs all actions as generic `'update'`, making the Recent Activity feed show unhelpful "update — 1-condo" entries instead of descriptive labels like "linked a document — Current Insurance Policies". Additionally, two minor code quality issues from the prior audit remediation need cleanup.

## Changes

### 1. Use specific audit actions instead of generic 'update'

**File:** `packages/db/src/utils/audit-logger.ts`

Add 4 compliance-specific actions to the `AuditAction` type union:
- `link_document`
- `unlink_document`
- `mark_not_applicable`
- `mark_applicable`

**File:** `apps/web/src/app/api/v1/compliance/route.ts`

Change the `logAuditEvent` call (line ~295-302) from:

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

To:

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

`patchAction` is already Zod-validated as one of the 4 specific actions. The activity feed already has `actionLabel()` mappings for all 4 actions and reads `metadata.itemTitle` as its preferred display label. No frontend changes needed.

### 2. Remove redundant `itemTitle` prop from ComplianceItemActions

**File:** `apps/web/src/components/compliance/compliance-item-actions.tsx`

Remove `itemTitle: string` from the props interface. Use `item.title` directly in all `aria-label` attributes instead. The component already receives the full `item` object.

**File:** `apps/web/src/components/compliance/compliance-dashboard.tsx`

Remove `itemTitle={item.title}` from the `<ComplianceItemActions>` call site.

### 3. Add clarifying comment to activity feed dedup

**File:** `apps/web/src/components/compliance/compliance-activity-feed.tsx`

The `useMemo` dedup by entry ID is a defensive no-op (entries have unique DB IDs — the "duplicate" appearance was caused by generic action labels, not duplicate rows). Add a comment explaining this so the next developer doesn't think it's solving the display issue:

```ts
// Defensive: deduplicate by ID in case the API ever returns duplicate rows.
// The "duplicate-looking" entries in Recent Activity were caused by all actions
// being logged as generic 'update' — fixed in the compliance PATCH endpoint.
```

## What doesn't change

- No migration. Append-only audit table. Old entries stay as "update".
- No frontend changes to the activity feed component (it already handles the 4 action types).
- No changes to the Zod schema or PATCH business logic.

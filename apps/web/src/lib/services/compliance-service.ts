/**
 * Compliance Service
 *
 * Tenant-scoped reads + writes for the `compliance_checklist_items` table
 * backing /api/v1/compliance (GET list / POST generate-from-template /
 * PATCH per-item action). Compliance is condo/HOA-only — caller MUST gate
 * via `requireCondoCommunity(membership.communityType)` BEFORE invoking.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/compliance/route.ts
 */
import {
  complianceChecklistItems,
  createScopedClient,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

/**
 * List every checklist item in the community. Compliance lists are small
 * (one row per template item — typically 10–25), so a full-table fetch
 * is the correct shape for the GET endpoint.
 */
export async function listComplianceChecklistItems(
  communityId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  return (await scoped.query(complianceChecklistItems)) as Array<Record<string, unknown>>;
}

/**
 * Insert the initial set of checklist items generated from the
 * compliance template. Caller MUST have already verified no items
 * exist (via `listComplianceChecklistItems`); the returned promise
 * propagates unique-violation errors (`error.code === '23505'`) so the
 * route can detect a race and re-fetch the existing rows.
 */
export async function insertComplianceChecklistItems(
  communityId: number,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.insert(complianceChecklistItems, rows);
}

/**
 * Clear the `documentId` link on every checklist item that points at a
 * document being soft-deleted, so a deleted document can no longer keep an
 * item "satisfied".
 *
 * Called from the documents DELETE handler. The compliance calculator also
 * defends against this at read time (treating a soft-deleted document as
 * unlinked), but clearing the FK keeps the data model honest and the audit
 * trail readable. The two writes are not atomic — the read-time defense
 * covers the brief window where the checklist row still references the row.
 *
 * Lives here rather than in the route so the route does not import the
 * `complianceChecklistItems` table directly (ADR-003 / guard:route-table-imports).
 */
export async function unlinkChecklistItemsForDocument(
  communityId: number,
  documentId: number,
  actorUserId: string,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    complianceChecklistItems,
    {
      documentId: null,
      documentPostedAt: null,
      lastModifiedBy: actorUserId,
    },
    eq(complianceChecklistItems.documentId, documentId),
  );
}

/**
 * Apply a single per-item action's update. Returns the updated row (with
 * scoped-client tenant injection still applied) or `null` if the row
 * doesn't exist in this community. Caller composes the audit log + status
 * derivation on top.
 */
export async function updateComplianceChecklistItem(
  communityId: number,
  itemId: number,
  values: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const scoped = createScopedClient(communityId);
  const updated = (await scoped.update(
    complianceChecklistItems,
    values,
    eq(complianceChecklistItems.id, itemId),
  )) as Array<Record<string, unknown>>;
  return updated[0] ?? null;
}

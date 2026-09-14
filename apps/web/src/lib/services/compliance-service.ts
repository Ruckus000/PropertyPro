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
 * The template keys for the rolling 12-month minutes item, one per statute.
 * A community has at most one (condo or HOA); apartments have neither, since
 * the compliance checklist is condo/HOA-only.
 */
const MINUTES_ROLLING_TEMPLATE_KEYS = new Set([
  '718_minutes_rolling_12m',
  '720_minutes_rolling_12m',
]);

/**
 * Point the rolling-12-month minutes item at the minutes that were just
 * published, so publishing satisfies the item the way a manual link does.
 *
 * WHY THIS EXISTS. Satisfaction is `document_id IS NOT NULL` — derived at read
 * time, never stored — and until now the only runtime writer was the
 * `link_document` PATCH. So a board could publish every meeting's minutes
 * through the authoring flow and the checklist would still read "needs board
 * action" forever, because `BOARD_ACTION_TEMPLATE_KEYS` includes both minutes
 * keys. The publish route already stamps `meetings.minutes_approved_at` and
 * calls that "the posting event §718.111(12)(g)'s 30-day window measures"; this
 * writes the one FK every other consumer reads (the calculator, the alert cron,
 * the PM portfolio's raw-SQL counters, the admin console) so they all agree
 * without each needing to learn about the stamp.
 *
 * This is the mirror of `unlinkChecklistItemsForDocument` below: deleting a
 * document already un-satisfies the item automatically, and only the linking
 * half was missing.
 *
 * LATEST-WINS IS DELIBERATE. One FK cannot represent twelve months of minutes
 * as a set, but it does not need to: `calculateComplianceStatus` uses the
 * rolling window only to DEMOTE a linked item to `overdue` once its document
 * falls outside the window, so pointing at the most recent minutes is exactly
 * "a rolling 12-month window is being maintained".
 *
 * Returns the id of the item it linked, or `null` when the community has no
 * such item (every apartment) or it is marked not-applicable — both ordinary,
 * neither an error.
 *
 * Lives here rather than in the route so the route does not import the
 * `complianceChecklistItems` table directly (ADR-003 / guard:route-table-imports).
 */
export async function linkMinutesDocumentToChecklist(
  communityId: number,
  documentId: number,
  actorUserId: string,
  postedAt: Date,
): Promise<number | null> {
  const items = await listComplianceChecklistItems(communityId);
  const item = items.find(
    (row) =>
      MINUTES_ROLLING_TEMPLATE_KEYS.has(String(row['templateKey'] ?? '')) &&
      row['isApplicable'] !== false,
  );
  if (!item) {
    return null;
  }

  const itemId = Number(item['id']);
  const scoped = createScopedClient(communityId);
  await scoped.update(
    complianceChecklistItems,
    {
      documentId,
      documentPostedAt: postedAt,
      lastModifiedBy: actorUserId,
    },
    eq(complianceChecklistItems.id, itemId),
  );
  return itemId;
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

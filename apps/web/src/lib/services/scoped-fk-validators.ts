/**
 * Cross-tenant FK validators.
 *
 * Routes that accept ID references in their request body (unitId, documentId,
 * etc.) MUST verify those IDs resolve inside the active community. Without this
 * check, a community-A admin can post a community-B unitId and the resulting
 * row will silently bind to the foreign tenant — defeating tenant isolation.
 *
 * These helpers wrap `scoped.queryById()` so the lookup is tenant-scoped: if
 * the id does not belong to the active community, queryById returns null and
 * the helper throws ValidationError.
 */
import { documents, units, type ScopedClient } from '@propertypro/db';
import { ValidationError } from '@/lib/api/errors';

export async function assertUnitInCommunity(
  scoped: ScopedClient,
  unitId: number | null | undefined,
): Promise<void> {
  if (unitId == null) return;
  const row = await scoped.queryById(units, unitId);
  if (!row) {
    throw new ValidationError(
      `Unit ${unitId} does not exist in this community.`,
      { fields: { unitId: 'Unit not found in this community' } },
    );
  }
}

export async function assertDocumentInCommunity(
  scoped: ScopedClient,
  documentId: number | null | undefined,
): Promise<void> {
  if (documentId == null) return;
  const row = await scoped.queryById(documents, documentId);
  if (!row) {
    throw new ValidationError(
      `Document ${documentId} does not exist in this community.`,
      { fields: { documentId: 'Document not found in this community' } },
    );
  }
}

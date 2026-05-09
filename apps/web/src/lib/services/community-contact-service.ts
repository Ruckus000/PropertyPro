/**
 * Community Contact Service
 *
 * Wraps reads/writes to the contact columns on `communities` so route
 * handlers don't import the table directly (Plan A3 third-boundary-guard
 * compliance).
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/community/contact/route.ts
 */
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

export interface CommunityContact {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

function shape(row: Record<string, unknown> | undefined): CommunityContact {
  return {
    contactName: (row?.['contactName'] as string | null) ?? null,
    contactEmail: (row?.['contactEmail'] as string | null) ?? null,
    contactPhone: (row?.['contactPhone'] as string | null) ?? null,
  };
}

/**
 * Read the community's contact info. Returns all-nulls if the community row
 * is missing — matches pre-A3 behavior where the route surfaced
 * `contactX ?? null` regardless of whether the row was found.
 */
export async function getCommunityContact(
  communityId: number,
): Promise<CommunityContact> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  return shape(rows[0] as Record<string, unknown> | undefined);
}

export interface UpdateCommunityContactPatch {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface UpdatedCommunityContact {
  /** The fields actually included in the UPDATE (excludes unset patch keys). */
  updateData: Record<string, unknown>;
  /** The row's contact shape after the write — same projection as `getCommunityContact`. */
  contact: CommunityContact;
}

/**
 * Apply a partial update to the community's contact columns. Skips fields
 * that are `undefined` in the patch (so a caller can clear a single field
 * by passing `null` while leaving others alone).
 *
 * Returns:
 * - `updateData`: the actual `{ key: value }` map written, useful for
 *   `audit.newValues`.
 * - `contact`: the post-update contact shape, suitable for the response
 *   payload.
 *
 * Caller is responsible for authorization (`membership.isAdmin`) and demo-
 * grace assertion before invoking.
 */
export async function updateCommunityContact(
  communityId: number,
  patch: UpdateCommunityContactPatch,
): Promise<UpdatedCommunityContact> {
  const updateData: Record<string, unknown> = {};
  if (patch.contactName !== undefined) updateData['contactName'] = patch.contactName;
  if (patch.contactEmail !== undefined) updateData['contactEmail'] = patch.contactEmail;
  if (patch.contactPhone !== undefined) updateData['contactPhone'] = patch.contactPhone;

  const scoped = createScopedClient(communityId);
  const updated = await scoped.update(
    communities,
    updateData,
    eq(communities.id, communityId),
  );

  const row = (updated as unknown as Record<string, unknown>[])[0];
  return { updateData, contact: shape(row) };
}

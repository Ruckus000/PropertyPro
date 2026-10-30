/**
 * Community Profile Service
 *
 * Wraps reads/writes to top-level profile columns on `communities` (the display
 * `name`, `unit_count`, and the profile: short name, address, office hours and
 * the public contact details) so route handlers don't import the table directly
 * (Plan A3 third-boundary-guard compliance). Mirrors the scoped-client +
 * explicit-id-filter pattern used by community-contact-service.ts.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/community/profile/route.ts (the profile)
 *   - apps/web/src/app/api/v1/community/unit-count/route.ts (the count)
 */
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// The profile save opens one transaction, so the name, the contact columns, the
// profile columns and their audit rows commit or roll back as one.
// AUTHZ: opens a transaction only; every statement in it runs through createScopedClient(communityId, tx) or logAuditEvent(..., tx), and the route requires a community admin.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { NotFoundError } from '@/lib/api/errors';
import { updateCommunityContact } from '@/lib/services/community-contact-service';

/**
 * A database handle: the pool's, or an open transaction's. Taken from
 * `createScopedClient`'s own signature so the two cannot drift.
 */
type Executor = NonNullable<Parameters<typeof createScopedClient>[1]>;

/**
 * Read the community's current display name, or null if the row is missing.
 * Pass `executor` to read inside a transaction.
 */
export async function getCommunityName(
  communityId: number,
  executor?: Executor,
): Promise<string | null> {
  const scoped = createScopedClient(communityId, executor);
  const rows = await scoped.query(communities);
  return ((rows[0] as Record<string, unknown> | undefined)?.['name'] as string | null) ?? null;
}

export interface UpdateCommunityNameResult {
  /** The persisted name after the call. */
  name: string;
  /** False when the supplied name matched the current value (no write, no audit). */
  changed: boolean;
}

/**
 * Update the community's display name, emitting a `community` update audit
 * entry (old → new) when the value actually changes. No-op (no write, no
 * audit) when the name is unchanged. Caller is responsible for authorization
 * (property_manager / root_manager) before invoking — the onboarding-website
 * route does this via `ensurePmAccess`.
 *
 * Pass `executor` (the handle of a `db.transaction` callback) to read, write and
 * audit through that transaction, so the rename and its audit row commit or roll
 * back with the caller's other writes. Left out, everything runs on the pool as
 * before.
 */
export async function updateCommunityName(
  communityId: number,
  name: string,
  opts: { actorUserId: string },
  executor?: Executor,
): Promise<UpdateCommunityNameResult> {
  const previous = await getCommunityName(communityId, executor);
  if (name === previous) {
    return { name: previous, changed: false };
  }

  const scoped = createScopedClient(communityId, executor);
  const updated = await scoped.update(
    communities,
    { name },
    eq(communities.id, communityId),
  );
  const persisted =
    ((updated as unknown as Record<string, unknown>[])[0]?.['name'] as string | undefined) ?? name;

  const entry: Parameters<typeof logAuditEvent>[0] = {
    userId: opts.actorUserId,
    communityId,
    action: 'update',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: { name: previous },
    newValues: { name: persisted },
  };
  // With no executor the call keeps its original one-argument shape; the default
  // is the pool's db.
  await (executor ? logAuditEvent(entry, executor) : logAuditEvent(entry));

  return { name: persisted, changed: true };
}

/** Read the community's unit (condo) / parcel (HOA) count; null when unknown. */
export async function getCommunityUnitCount(communityId: number): Promise<number | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  return ((rows[0] as Record<string, unknown> | undefined)?.['unitCount'] as number | null) ?? null;
}

/**
 * Record how many units (or parcels) the association has. It decides whether
 * Florida's website rules apply (packages/shared `requirementLevel`), so every
 * change is audited old → new; unchanged is a no-op with no audit row, as for
 * the name. Caller authorizes (community admin) before invoking.
 */
export async function updateCommunityUnitCount(
  communityId: number,
  unitCount: number,
  opts: { actorUserId: string },
): Promise<{ unitCount: number; changed: boolean }> {
  const previous = await getCommunityUnitCount(communityId);
  if (unitCount === previous) return { unitCount, changed: false };

  const scoped = createScopedClient(communityId);
  await scoped.update(communities, { unitCount }, eq(communities.id, communityId));

  await logAuditEvent({
    userId: opts.actorUserId,
    communityId,
    action: 'update',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: { unitCount: previous },
    newValues: { unitCount },
  });

  return { unitCount, changed: true };
}

/**
 * The association's profile: what Settings shows, and what the public website
 * reads for its name, address, hours and contact details. `unitCount` is
 * returned for display only; it is written by {@link updateCommunityUnitCount}.
 */
export interface CommunityProfile {
  name: string;
  /** Optional short form of `name` for headlines; null falls back to `name`. */
  shortName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  /** Units (condo) or parcels (HOA); null is UNKNOWN, never zero. */
  unitCount: number | null;
  officeHours: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

/** What {@link updateCommunityProfile} accepts: a key that is absent is left alone, `null` clears it. */
type CommunityProfilePatch = Partial<Omit<CommunityProfile, 'unitCount'>>;

/**
 * The columns the profile writes itself. The name and the contact columns have
 * their own writers. `satisfies` ties every key to a real column of
 * `communities`, so a misspelt or renamed one is a compile error here instead
 * of a column Drizzle quietly ignores.
 */
const OWN_KEYS = [
  'shortName',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zipCode',
  'officeHours',
] as const satisfies readonly (keyof typeof communities.$inferInsert)[];

/** The columns {@link updateCommunityContact} owns; tied to the table the same way. */
const CONTACT_KEYS = [
  'contactName',
  'contactEmail',
  'contactPhone',
] as const satisfies readonly (keyof typeof communities.$inferInsert)[];

type TextKey = (typeof OWN_KEYS)[number] | (typeof CONTACT_KEYS)[number];
type TextChanges = Partial<Record<TextKey, string | null>>;

/**
 * The profile as the table holds it. Typed from the table, so a misspelt column
 * on the read side is a compile error too. `unitCount` is the only one that is
 * not text.
 */
async function loadProfile(communityId: number, executor?: Executor): Promise<CommunityProfile> {
  const scoped = createScopedClient(communityId, executor);
  const rows = await scoped.query(communities);
  const row = rows[0] as unknown as typeof communities.$inferSelect | undefined;
  if (!row) throw new NotFoundError('Community not found');

  return {
    name: row.name,
    shortName: row.shortName ?? null,
    addressLine1: row.addressLine1 ?? null,
    addressLine2: row.addressLine2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    zipCode: row.zipCode ?? null,
    unitCount: row.unitCount ?? null,
    officeHours: row.officeHours ?? null,
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    contactPhone: row.contactPhone ?? null,
  };
}

/**
 * Read the community's profile.
 *
 * Throws NotFoundError when the community is missing or soft-deleted: unlike
 * the name or the contact details there is no honest all-null profile to
 * return, and every caller has already resolved the community by then.
 */
export async function getCommunityProfile(communityId: number): Promise<CommunityProfile> {
  return loadProfile(communityId);
}

/** The entries of `patch` under `keys` whose value is given (not undefined) and differs from what is stored. */
function changedText(
  keys: readonly TextKey[],
  patch: CommunityProfilePatch,
  before: CommunityProfile,
): TextChanges {
  const changed: TextChanges = {};
  for (const key of keys) {
    const next = patch[key];
    if (next !== undefined && next !== before[key]) changed[key] = next;
  }
  return changed;
}

/**
 * Apply a partial update to the profile and return the profile as it now
 * stands. An absent (or undefined) key is left alone and `null` clears it. The
 * route's contract has already trimmed the values and turned a blank into
 * `null`. The unit count is not written here.
 *
 * The columns have three writers:
 *   - `name`: {@link updateCommunityName}, which audits its own write (a
 *     `community` row);
 *   - the contact columns: `updateCommunityContact`, which does NOT audit (the
 *     contact route audits for itself, as `community.contact_updated`, and this
 *     path does not go through that route);
 *   - everything else: one UPDATE here.
 * Only a value that differs from what is stored is written. Every changed key
 * that no other writer audits, the contact columns and the rest, goes into ONE
 * `update` row on `community_profile` with the old and new values side by side.
 * A rename alone adds none, and nothing is written or audited when nothing
 * changed.
 *
 * **The save is all or nothing.** The reads, the three writers and both audit
 * rows run in ONE transaction, every statement on its handle: if any of them
 * throws (a dropped connection, a pooler or function timeout, a failed audit
 * insert, a failed read-back), the whole save rolls back and the caller gets the
 * error. A committed change therefore always has its audit row, and a failed
 * save leaves nothing behind that a retry cannot simply do again. Nothing in
 * the transaction may touch the pool: an instance's pool holds only three
 * connections (`POOL_MAX`, packages/db/src/drizzle.ts), and a statement that
 * waits for a second one while this one is held can starve it.
 *
 * Two admins saving at the same instant are not serialized (no row lock). Each
 * field is written by absolute value, so neither save can undo a different
 * field the other changed; if both change the SAME field, both writes land and
 * the later audit row may record, as its old value, the one from before the
 * other admin's save.
 *
 * The caller authorizes (community admin) and rejects a demo in its grace
 * window before invoking.
 */
export async function updateCommunityProfile(
  communityId: number,
  patch: CommunityProfilePatch,
  opts: { actorUserId: string },
): Promise<CommunityProfile> {
  return createUnscopedClient().transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    const before = await loadProfile(communityId, executor);

    if (patch.name !== undefined) {
      await updateCommunityName(communityId, patch.name, opts, executor);
    }

    const contactChanges = changedText(CONTACT_KEYS, patch, before);
    if (Object.keys(contactChanges).length > 0) {
      await updateCommunityContact(communityId, contactChanges, executor);
    }

    const ownChanges = changedText(OWN_KEYS, patch, before);
    if (Object.keys(ownChanges).length > 0) {
      const scoped = createScopedClient(communityId, executor);
      await scoped.update(communities, ownChanges, eq(communities.id, communityId));
    }

    const audited: TextChanges = { ...contactChanges, ...ownChanges };
    const auditedKeys = Object.keys(audited) as TextKey[];
    if (auditedKeys.length > 0) {
      await logAuditEvent(
        {
          userId: opts.actorUserId,
          communityId,
          action: 'update',
          resourceType: 'community_profile',
          resourceId: String(communityId),
          oldValues: Object.fromEntries(auditedKeys.map((key) => [key, before[key]])),
          newValues: audited,
        },
        executor,
      );
    }

    return loadProfile(communityId, executor);
  });
}

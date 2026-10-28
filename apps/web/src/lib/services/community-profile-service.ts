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
 *   - apps/web/src/app/api/v1/pm/onboarding/website/route.ts (wizard name edit)
 *   - apps/web/src/app/api/v1/community/profile/route.ts (the profile)
 *   - apps/web/src/app/api/v1/community/unit-count/route.ts (the count)
 */
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { NotFoundError } from '@/lib/api/errors';
import { updateCommunityContact } from '@/lib/services/community-contact-service';

/** Read the community's current display name, or null if the row is missing. */
export async function getCommunityName(communityId: number): Promise<string | null> {
  const scoped = createScopedClient(communityId);
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
 */
export async function updateCommunityName(
  communityId: number,
  name: string,
  opts: { actorUserId: string },
): Promise<UpdateCommunityNameResult> {
  const previous = await getCommunityName(communityId);
  if (name === previous) {
    return { name: previous, changed: false };
  }

  const scoped = createScopedClient(communityId);
  const updated = await scoped.update(
    communities,
    { name },
    eq(communities.id, communityId),
  );
  const persisted =
    ((updated as unknown as Record<string, unknown>[])[0]?.['name'] as string | undefined) ?? name;

  await logAuditEvent({
    userId: opts.actorUserId,
    communityId,
    action: 'update',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: { name: previous },
    newValues: { name: persisted },
  });

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

/** The columns the profile writes itself. The name and the contact columns have their own writers. */
const OWN_KEYS = [
  'shortName',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'zipCode',
  'officeHours',
] as const;

/** The columns {@link updateCommunityContact} owns. */
const CONTACT_KEYS = ['contactName', 'contactEmail', 'contactPhone'] as const;

type TextKey = (typeof OWN_KEYS)[number] | (typeof CONTACT_KEYS)[number];
type TextChanges = Partial<Record<TextKey, string | null>>;

function textOrNull(value: unknown): string | null {
  return (value as string | null | undefined) ?? null;
}

/**
 * Read the community's profile.
 *
 * Throws NotFoundError when the community is missing or soft-deleted: unlike
 * the name or the contact details there is no honest all-null profile to
 * return, and every caller has already resolved the community by then.
 */
export async function getCommunityProfile(communityId: number): Promise<CommunityProfile> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(communities);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new NotFoundError('Community not found');

  return {
    name: row['name'] as string,
    shortName: textOrNull(row['shortName']),
    addressLine1: textOrNull(row['addressLine1']),
    addressLine2: textOrNull(row['addressLine2']),
    city: textOrNull(row['city']),
    state: textOrNull(row['state']),
    zipCode: textOrNull(row['zipCode']),
    unitCount: (row['unitCount'] as number | null | undefined) ?? null,
    officeHours: textOrNull(row['officeHours']),
    contactName: textOrNull(row['contactName']),
    contactEmail: textOrNull(row['contactEmail']),
    contactPhone: textOrNull(row['contactPhone']),
  };
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
 * That row is written straight after the last write, from the values held here;
 * the profile handed back is read afterwards, so a failed read-back cannot leave
 * a committed change with no audit entry.
 *
 * The caller authorizes (community admin) and rejects a demo in its grace
 * window before invoking.
 */
export async function updateCommunityProfile(
  communityId: number,
  patch: CommunityProfilePatch,
  opts: { actorUserId: string },
): Promise<CommunityProfile> {
  const before = await getCommunityProfile(communityId);

  if (patch.name !== undefined) {
    await updateCommunityName(communityId, patch.name, opts);
  }

  const contactChanges = changedText(CONTACT_KEYS, patch, before);
  if (Object.keys(contactChanges).length > 0) {
    await updateCommunityContact(communityId, contactChanges);
  }

  const ownChanges = changedText(OWN_KEYS, patch, before);
  if (Object.keys(ownChanges).length > 0) {
    const scoped = createScopedClient(communityId);
    await scoped.update(communities, ownChanges, eq(communities.id, communityId));
  }

  const audited: TextChanges = { ...contactChanges, ...ownChanges };
  const auditedKeys = Object.keys(audited) as TextKey[];
  if (auditedKeys.length > 0) {
    await logAuditEvent({
      userId: opts.actorUserId,
      communityId,
      action: 'update',
      resourceType: 'community_profile',
      resourceId: String(communityId),
      oldValues: Object.fromEntries(auditedKeys.map((key) => [key, before[key]])),
      newValues: audited,
    });
  }

  return getCommunityProfile(communityId);
}

/**
 * Community Profile Service
 *
 * Wraps reads/writes to top-level profile columns on `communities` (currently
 * just the display `name`) so route handlers don't import the table directly
 * (Plan A3 third-boundary-guard compliance). Mirrors the scoped-client +
 * explicit-id-filter pattern used by community-contact-service.ts.
 *
 * Companion to:
 *   - apps/web/src/app/api/v1/pm/onboarding/website/route.ts (wizard name edit)
 */
import { communities, createScopedClient, logAuditEvent } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

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
 * (pm_admin/cam) before invoking.
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

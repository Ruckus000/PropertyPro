// AUTHZ: notifies the OTHER property_manager/root_manager members of a community
// that root was claimed (role-v3 Phase 2b §3.5). It performs a cross-community-by-
// nature unscoped read of the community's admin-tier members (communities + user
// rows have no per-request community scoping for this recipient lookup), so it
// imports createUnscopedClient from @propertypro/db/unsafe and MUST be added to
// WEB_UNSAFE_IMPORT_ALLOWLIST in scripts/verify-scoped-db-access.ts (both guards
// apply — the AUTHZ comment alone is insufficient). The recipient set explicitly
// EXCLUDES the claimant; the caller has already authorized the claim.
import { createElement } from 'react';
import { communities, users, userRoles } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, eq, inArray, ne } from '@propertypro/db/filters';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';
import { RootClaimedEmail, sendEmail } from '@propertypro/email';
import { createNotificationsForEvent } from '@/lib/services/notification-service';

interface AdminRecipientRow {
  userId: string;
  email: string;
  fullName: string | null;
}

/**
 * Notify the OTHER admins of `communityId` (every property_manager/root_manager,
 * excluding `claimantUserId`) that root was claimed, with a dispute link.
 *
 * Sends a `RootClaimedEmail` to each recipient and fires in-app notifications via
 * the shared notification helper (which self-excludes the claimant). Callers
 * should treat this as best-effort — the claim has already committed.
 */
export async function notifyRootClaimed(
  communityId: number,
  claimantUserId: string,
): Promise<void> {
  const db = createUnscopedClient();

  // Other admin-tier members of this community (exclude the claimant).
  const recipients = (await db
    .select({
      userId: userRoles.userId,
      email: users.email,
      fullName: users.fullName,
    })
    .from(userRoles)
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.communityId, communityId),
        inArray(userRoles.role, [...ADMIN_TIER_DB_ROLES]),
        ne(userRoles.userId, claimantUserId),
      ),
    )) as AdminRecipientRow[];

  const [claimantRow] = (await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, claimantUserId))) as Array<{ fullName: string | null }>;
  const claimantName = claimantRow?.fullName ?? 'A property manager';

  const [communityRow] = (await db
    .select({ name: communities.name })
    .from(communities)
    .where(eq(communities.id, communityId))) as Array<{ name: string | null }>;
  const communityName = communityRow?.name ?? 'your community';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const disputeUrl = `${appUrl}/dashboard/claim-root?dispute=${communityId}`;

  // Email each other admin (best-effort per recipient — one failure must not
  // block the rest, and the in-app path below still fires).
  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: `Root manager claimed for ${communityName}`,
        category: 'transactional',
        react: createElement(RootClaimedEmail, {
          branding: { communityName },
          claimantName,
          communityName,
          disputeUrl,
        }),
      });
    } catch (err) {
      console.warn('[claim-root] recipient email failed', {
        communityId,
        userId: recipient.userId,
        err,
      });
    }
  }

  // In-app notification for community admins (the helper excludes the claimant).
  await createNotificationsForEvent(
    communityId,
    {
      category: 'system',
      title: `Root manager claimed for ${communityName}`,
      body: `${claimantName} is now the root manager of ${communityName}. If this isn't right, you can dispute it.`,
      actionUrl: disputeUrl,
      sourceType: 'community',
      sourceId: String(communityId),
      priority: 'high',
    },
    'community_admins',
    claimantUserId,
  );
}

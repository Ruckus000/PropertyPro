import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles } from '@propertypro/db';
import { eq, and, isNull, inArray } from '@propertypro/db/filters';
import { createNotificationsForEvent } from '@/lib/services/notification-service';
import { tierToPercentOff, type VolumeTier } from './tier-calculator';

export async function notifyDowngrade(input: {
  billingGroupId: number;
  previousTier: VolumeTier;
  newTier: VolumeTier;
  canceledCommunityName: string;
}): Promise<void> {
  const prevPct = tierToPercentOff(input.previousTier);
  const newPct = tierToPercentOff(input.newTier);

  const db = createUnscopedClient();

  const groupCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.billingGroupId, input.billingGroupId), isNull(communities.deletedAt)));

  if (groupCommunities.length === 0) return;

  const communityIds = groupCommunities.map((c) => c.id);

  // Find all manager/pm_admin users in the remaining communities
  const adminRows = await db
    .selectDistinct({ userId: userRoles.userId, communityId: userRoles.communityId })
    .from(userRoles)
    .where(
      and(
        inArray(userRoles.communityId, communityIds),
        inArray(userRoles.role, ['manager', 'pm_admin'] as ('resident' | 'manager' | 'pm_admin')[]),
      ),
    );

  if (adminRows.length === 0) return;

  const title = 'Portfolio discount changed';
  const body = `Your volume discount dropped from ${prevPct}% to ${newPct}% because ${input.canceledCommunityName} was canceled. Your next invoice will reflect the new rate.`;

  // Group admins by community so we can dispatch per-community in-app notifications
  const adminsByCommunity = new Map<number, string[]>();
  for (const row of adminRows) {
    const existing = adminsByCommunity.get(row.communityId) ?? [];
    existing.push(row.userId);
    adminsByCommunity.set(row.communityId, existing);
  }

  for (const [communityId, userIds] of adminsByCommunity) {
    for (const userId of userIds) {
      await createNotificationsForEvent(
        communityId,
        {
          category: 'system',
          title,
          body,
          sourceType: 'billing_group',
          sourceId: String(input.billingGroupId),
          priority: 'high',
        },
        { type: 'specific_user', userId },
      ).catch((err) => {
        console.error('[downgrade-notifications] failed to notify user', userId, 'in community', communityId, err);
      });
    }
  }
}

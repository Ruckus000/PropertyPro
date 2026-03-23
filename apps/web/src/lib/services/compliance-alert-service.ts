/**
 * Compliance alert service — P2-41.
 *
 * Scans compliance checklist items for overdue entries and sends
 * a single digest-style compliance-alert notification to community admins.
 *
 * Designed to be called by the daily compliance-alerts cron job.
 */
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
} from '@propertypro/db';
import { isNull } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { sendNotification } from '@/lib/services/notification-service';
import type { ComplianceAlertEvent } from '@/lib/services/notification-service';
import { calculateComplianceStatus } from '@/lib/utils/compliance-calculator';

export interface ComplianceAlertResult {
  communityId: number;
  overdueCount: number;
  notifiedCount: number;
}

interface OverdueItem {
  title: string;
  description: string;
  deadline: string;
  statuteReference: string;
}

/**
 * Check a community's compliance checklist for overdue items and send
 * a single digest alert to community admins.
 *
 * Returns the number of overdue items found and how many admin recipients
 * were notified.
 */
export async function checkAndAlertOverdueItems(
  communityId: number,
  actorUserId?: string,
  now: Date = new Date(),
): Promise<ComplianceAlertResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(complianceChecklistItems);

  const overdueItems: OverdueItem[] = [];

  for (const row of rows) {
    const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
    const documentPostedAt = row['documentPostedAt']
      ? new Date(row['documentPostedAt'] as string)
      : null;
    const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
    const rollingWindowMonths =
      typeof rollingWindowRecord?.months === 'number'
        ? rollingWindowRecord.months
        : null;

    const status = calculateComplianceStatus({
      isApplicable: row['isApplicable'] as boolean | undefined,
      documentId: (row['documentId'] as number | null) ?? null,
      documentPostedAt,
      deadline,
      rollingWindowMonths,
      now,
    });

    if (status === 'overdue') {
      overdueItems.push({
        title: typeof row['title'] === 'string' ? row['title'] : 'Compliance Item',
        description: typeof row['description'] === 'string' ? row['description'] : '',
        deadline: deadline
          ? deadline.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'No deadline',
        statuteReference:
          typeof row['statuteReference'] === 'string'
            ? row['statuteReference']
            : 'Florida Statute §718.111(12)(g)',
      });
    }
  }

  if (overdueItems.length === 0) {
    return { communityId, overdueCount: 0, notifiedCount: 0 };
  }

  // Send ONE digest notification per community (not one per item)
  const event: ComplianceAlertEvent = {
    type: 'compliance_alert',
    alertTitle: `${overdueItems.length} compliance item${overdueItems.length > 1 ? 's' : ''} overdue`,
    alertDescription: overdueItems.map((i) => `${i.title} (${i.statuteReference})`).join('; '),
    dueDate: overdueItems[0]!.deadline,
    severity: 'critical',
    statuteReference: overdueItems.map((i) => i.statuteReference).join(', '),
    sourceType: 'compliance',
    sourceId: String(communityId),
  };

  const notifiedCount = await sendNotification(communityId, event, 'community_admins', actorUserId);

  return {
    communityId,
    overdueCount: overdueItems.length,
    notifiedCount,
  };
}

// ---------------------------------------------------------------------------
// Cross-community cron entry point
// ---------------------------------------------------------------------------

export interface ComplianceAlertSummary {
  communitiesProcessed: number;
  totalOverdue: number;
  /** Sum of admin recipients reached across all communities (not notification count). */
  totalNotified: number;
  errors: number;
}

/**
 * Iterate all compliance-enabled communities and check for overdue items.
 * Called by the daily cron at /api/v1/internal/compliance-alerts.
 *
 * Uses createUnscopedClient() to list communities, then createScopedClient()
 * per community via checkAndAlertOverdueItems.
 */
export async function processComplianceAlerts(
  now: Date = new Date(),
): Promise<ComplianceAlertSummary> {
  const db = createUnscopedClient();

  const activeCommunities = await db
    .select({ id: communities.id, communityType: communities.communityType })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const complianceCommunities = activeCommunities.filter(
    (c) => c.communityType === 'condo_718' || c.communityType === 'hoa_720',
  );

  const summary: ComplianceAlertSummary = {
    communitiesProcessed: 0,
    totalOverdue: 0,
    totalNotified: 0,
    errors: 0,
  };

  for (const community of complianceCommunities) {
    try {
      const result = await checkAndAlertOverdueItems(community.id, undefined, now);
      summary.communitiesProcessed++;
      summary.totalOverdue += result.overdueCount;
      summary.totalNotified += result.notifiedCount;
    } catch (err) {
      summary.errors++;
      console.error(`[compliance-alerts] Failed for community ${community.id}:`, err);
    }
  }

  return summary;
}

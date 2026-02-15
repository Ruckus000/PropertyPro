/**
 * Compliance alert service — P2-41.
 *
 * Scans compliance checklist items for overdue entries and sends
 * compliance-alert notifications to community admins.
 *
 * Designed to be called by a cron job or invoked manually by an admin.
 */
import {
  complianceChecklistItems,
  createScopedClient,
} from '@propertypro/db';
import { sendNotification } from '@/lib/services/notification-service';
import type { ComplianceAlertEvent } from '@/lib/services/notification-service';

export interface ComplianceAlertResult {
  communityId: number;
  overdueCount: number;
  notifiedCount: number;
}

/**
 * Check a community's compliance checklist for overdue items and send
 * alerts to community admins.
 *
 * Returns the number of overdue items found and how many recipients
 * were notified.
 */
export async function checkAndAlertOverdueItems(
  communityId: number,
  actorUserId?: string,
): Promise<ComplianceAlertResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(complianceChecklistItems);

  const now = new Date();
  const overdueItems: Array<{
    title: string;
    description: string;
    deadline: string;
    statuteReference: string;
  }> = [];

  for (const row of rows) {
    const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
    const documentId = row['documentId'] as number | null;

    // Item is overdue if it has a deadline in the past and no document linked
    if (deadline && deadline < now && !documentId) {
      overdueItems.push({
        title: typeof row['title'] === 'string' ? row['title'] : 'Compliance Item',
        description: typeof row['description'] === 'string' ? row['description'] : '',
        deadline: deadline.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
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

  // Send one alert per overdue item to community admins
  let totalNotified = 0;
  for (const item of overdueItems) {
    const event: ComplianceAlertEvent = {
      type: 'compliance_alert',
      alertTitle: item.title,
      alertDescription: `${item.description} — ${item.statuteReference}`,
      dueDate: item.deadline,
      severity: 'critical',
      statuteReference: item.statuteReference,
    };

    const count = await sendNotification(communityId, event, 'community_admins', actorUserId);
    totalNotified += count;
  }

  return {
    communityId,
    overdueCount: overdueItems.length,
    notifiedCount: totalNotified,
  };
}

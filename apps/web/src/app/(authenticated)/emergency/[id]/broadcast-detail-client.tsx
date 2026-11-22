/**
 * Emergency Broadcast delivery report page.
 *
 * Route: /emergency/[id]?communityId=X
 * Auth: any community member with emergency_broadcasts read permission.
 * Managers get the delivery report; everyone else gets the message only, and
 * only for an alert sent to them (the API returns 404 otherwise).
 */
"use client";

import { useSearchParams, useParams } from 'next/navigation';
import { useEmergencyBroadcast } from '@/hooks/use-emergency-broadcasts';
import { DeliveryReport } from '@/components/emergency/DeliveryReport';
import { PageHeader } from '@/components/shared/page-header';

export function BroadcastDetailClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const broadcastId = Number(params.id);
  const communityId = Number(searchParams.get('communityId'));

  const { data: report, isLoading, error } = useEmergencyBroadcast(communityId, broadcastId);

  if (!communityId || !broadcastId) {
    return <p className="text-sm text-status-danger">Missing communityId or broadcast ID.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-content-secondary">Loading delivery report...</p>;
  }

  if (error || !report) {
    return <p className="text-sm text-status-danger">Failed to load broadcast: {error?.message}</p>;
  }

  // Only a manager's view carries the delivery report (recipients, status).
  const managerReport = 'recipients' in report ? report : null;

  const SEVERITY_BADGE: Record<string, string> = {
    emergency: 'bg-status-danger-bg text-status-danger',
    urgent: 'bg-status-warning-bg text-status-warning',
    info: 'bg-interactive-subtle text-interactive',
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={report.title}
        actions={
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[report.severity] ?? 'bg-surface-muted'}`}
          >
            {report.severity}
          </span>
        }
      />

      {/* Status banner */}
      {managerReport?.canceledAt && (
        <div className="rounded-md border border-edge bg-surface-hover p-3 text-sm text-content-secondary">
          This broadcast was canceled.
        </div>
      )}
      {managerReport && !managerReport.canceledAt && !managerReport.completedAt && (
        <div className="rounded-md border border-edge bg-status-warning-bg p-3 text-sm text-status-warning">
          This broadcast is pending confirmation.
        </div>
      )}

      {/* Message preview */}
      <div className="rounded-md border border-edge bg-surface-card p-4 space-y-2">
        <div className="text-xs font-medium uppercase text-content-secondary">Message</div>
        <p className="text-sm text-content whitespace-pre-wrap">{report.body}</p>
        {managerReport?.smsBody && (
          <>
            <div className="mt-3 text-xs font-medium uppercase text-content-secondary">SMS</div>
            <p className="text-sm text-content">{managerReport.smsBody}</p>
          </>
        )}
      </div>

      {/* Delivery report — managers only; residents get the message alone. */}
      {managerReport?.completedAt && (
        <DeliveryReport
          recipients={managerReport.recipients}
          recipientCount={managerReport.recipientCount}
          deliveredCount={managerReport.deliveredCount}
          failedCount={managerReport.failedCount}
          sentCount={managerReport.sentCount}
        />
      )}
    </div>
  );
}

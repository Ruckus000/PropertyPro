/**
 * Emergency Broadcast delivery report page.
 *
 * Route: /emergency/[id]?communityId=X
 * Auth: any community member with emergency_broadcasts read permission.
 */
"use client";

import { useSearchParams, useParams } from 'next/navigation';
import Link from 'next/link';
import { useEmergencyBroadcast } from '@/hooks/use-emergency-broadcasts';
import { DeliveryReport } from '@/components/emergency/DeliveryReport';

export default function BroadcastDetailPage() {
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

  const SEVERITY_BADGE: Record<string, string> = {
    emergency: 'bg-status-danger-bg text-status-danger',
    urgent: 'bg-status-warning-bg text-status-warning',
    info: 'bg-interactive-subtle text-interactive',
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/emergency?communityId=${communityId}`}
          className="text-sm text-content-link hover:underline"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold text-content">{report.title}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[report.severity] ?? 'bg-surface-muted'}`}>
          {report.severity}
        </span>
      </div>

      {/* Status banner */}
      {report.canceledAt && (
        <div className="rounded-md border border-edge bg-surface-hover p-3 text-sm text-content-secondary">
          This broadcast was canceled.
        </div>
      )}
      {!report.canceledAt && !report.completedAt && (
        <div className="rounded-md border border-edge bg-status-warning-bg p-3 text-sm text-status-warning">
          This broadcast is pending confirmation.
        </div>
      )}

      {/* Message preview */}
      <div className="rounded-md border border-edge bg-surface-card p-4 space-y-2">
        <div className="text-xs font-medium uppercase text-content-secondary">Message</div>
        <p className="text-sm text-content whitespace-pre-wrap">{report.body}</p>
        {report.smsBody && (
          <>
            <div className="mt-3 text-xs font-medium uppercase text-content-secondary">SMS</div>
            <p className="text-sm text-content">{report.smsBody}</p>
          </>
        )}
      </div>

      {/* Delivery report */}
      {report.completedAt && (
        <DeliveryReport
          recipients={report.recipients}
          recipientCount={report.recipientCount}
          deliveredCount={report.deliveredCount}
          failedCount={report.failedCount}
          sentCount={report.sentCount}
        />
      )}
    </div>
  );
}

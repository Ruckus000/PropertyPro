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
    return <p className="text-sm text-red-600">Missing communityId or broadcast ID.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading delivery report...</p>;
  }

  if (error || !report) {
    return <p className="text-sm text-red-600">Failed to load broadcast: {error?.message}</p>;
  }

  const SEVERITY_BADGE: Record<string, string> = {
    emergency: 'bg-red-100 text-red-800',
    urgent: 'bg-orange-100 text-orange-800',
    info: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/emergency?communityId=${communityId}`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">{report.title}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[report.severity] ?? 'bg-gray-100'}`}>
          {report.severity}
        </span>
      </div>

      {/* Status banner */}
      {report.canceledAt && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          This broadcast was canceled.
        </div>
      )}
      {!report.canceledAt && !report.completedAt && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          This broadcast is pending confirmation.
        </div>
      )}

      {/* Message preview */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
        <div className="text-xs font-medium uppercase text-gray-500">Message</div>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{report.body}</p>
        {report.smsBody && (
          <>
            <div className="mt-3 text-xs font-medium uppercase text-gray-500">SMS</div>
            <p className="text-sm text-gray-800">{report.smsBody}</p>
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

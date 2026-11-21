'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { useMyJoinRequests, type MyJoinRequest } from '@/hooks/use-join-requests';
import { formatShortDate } from '@/lib/utils/format-date';

/** Join-request status → the shared status vocabulary (icon + text + colour). */
const STATUS_DISPLAY: Record<string, { status: string; label: string }> = {
  pending: { status: 'review', label: 'Waiting for review' },
  approved: { status: 'completed', label: 'Approved' },
  denied: { status: 'rejected', label: 'Not approved' },
};

function statusDisplay(status: string): { status: string; label: string } {
  return STATUS_DISPLAY[status] ?? { status: 'neutral', label: status };
}

function RequestRow({ request }: { request: MyJoinRequest }) {
  const display = statusDisplay(request.status);
  const role = request.residentType === 'owner' ? 'Owner' : 'Tenant';
  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{request.communityName ?? 'A community'}</p>
            <p className="text-sm text-content-secondary mt-1">
              {request.unitIdentifier} · {role} · Sent {formatShortDate(request.createdAt)}
            </p>
          </div>
          <StatusBadge status={display.status} label={display.label} subtle />
        </div>
        {request.reviewNotes ? (
          <p className="text-sm mt-3">
            <span className="font-medium">Note from the manager:</span> {request.reviewNotes}
          </p>
        ) : null}
      </Card>
    </li>
  );
}

/**
 * The signed-in user's own join requests, with status and the reviewer's note,
 * so a requester can see where a request stands without waiting for a
 * notification. Renders nothing when they have sent none: the page's primary
 * content is the community search above it.
 */
export function MyJoinRequests() {
  const { data, isLoading, isError } = useMyJoinRequests();

  if (isLoading) {
    return (
      <section aria-label="Your requests" className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full" />
      </section>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load your requests"
        description="Please refresh the page to try again."
      />
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section aria-labelledby="my-join-requests-heading" className="space-y-2">
      <h2 id="my-join-requests-heading" className="text-lg font-semibold">
        Your requests
      </h2>
      <ul className="space-y-2">
        {data.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </ul>
    </section>
  );
}

'use client';

import { RequestCard } from '@/components/maintenance/RequestCard';
import { StatusUpdateForm } from '@/components/maintenance/StatusUpdateForm';
import { AlertBanner } from '@/components/shared/alert-banner';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useMaintenanceRequest } from '@/hooks/use-operations';

interface RequestDetailSheetProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
  requestId: number;
  communityTimezone: string;
  /** Managers change the status; everyone who can read the request comments on it. */
  isAdmin: boolean;
  userId: string;
  /** Returns focus to the card that opened the panel (see `SlideOverPanel`). */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A maintenance request's detail, opened over the Operations hub by
 * `?request=<id>`. The read is the API's: a resident gets only their own
 * requests (anything else answers 403 and shows the error state) and never
 * internal comments or notes.
 */
export function RequestDetailSheet({
  open,
  onClose,
  communityId,
  requestId,
  communityTimezone,
  isAdmin,
  userId,
  onCloseAutoFocus,
}: RequestDetailSheetProps) {
  const requestQuery = useMaintenanceRequest(communityId, requestId, { enabled: open });
  const request = requestQuery.data;

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
      title="Maintenance request"
      description={isAdmin ? 'Review the request, reply, and update its status.' : 'Follow progress and reply to management.'}
    >
      {requestQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {!requestQuery.isLoading && requestQuery.error ? (
        <AlertBanner
          status="danger"
          title="We couldn't load this request."
          description={requestQuery.error instanceof Error ? requestQuery.error.message : 'Please try again.'}
        />
      ) : null}

      {request ? (
        <div className="space-y-6">
          {isAdmin ? (
            <section aria-labelledby={`request-${request.id}-status`} className="space-y-3 rounded-md border border-edge p-4">
              <h3 id={`request-${request.id}-status`} className="text-sm font-semibold text-content">
                Status
              </h3>
              <StatusUpdateForm key={request.status} request={request} communityId={communityId} />
            </section>
          ) : null}
          <RequestCard
            request={request}
            communityId={communityId}
            communityTimezone={communityTimezone}
            viewerUserId={userId}
            isAdmin={isAdmin}
          />
        </div>
      ) : null}
    </SlideOverPanel>
  );
}

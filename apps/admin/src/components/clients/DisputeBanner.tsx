import { AlertBanner } from '@propertypro/ui';
import { ReassignRootControl } from '@/components/communities/ReassignRootControl';
import type { OpenDispute } from '@/lib/server/clients';

interface DisputeBannerProps {
  disputes: OpenDispute[];
}

/**
 * One subtle warning banner per open root-claim dispute, folded in from the
 * old Rootless Communities page (role-v3 Phase 2b). Shown on the Clients grid
 * when the active filter is `all` or `rootless`.
 */
export function DisputeBanner({ disputes }: DisputeBannerProps) {
  if (disputes.length === 0) return null;

  return (
    <div className="space-y-2">
      {disputes.map((dispute) => (
        <AlertBanner
          key={dispute.id}
          status="warning"
          variant="subtle"
          title={`Root-claim dispute: ${dispute.communityName}`}
          description={`Claimed by ${dispute.claimedUserId} · disputed by ${dispute.disputedByUserId}`}
          action={<ReassignRootControl communityId={dispute.communityId} />}
        />
      ))}
    </div>
  );
}

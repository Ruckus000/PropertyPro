'use client';

import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PropScene } from '@propertypro/ui';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdminJoinRequests,
  useReviewJoinRequest,
  type PendingRequest,
  type ReviewJoinRequestInput,
} from '@/hooks/use-admin-join-requests';

function ownerLabel(owner: { name: string | null; email: string | null }): string {
  return [owner.name, owner.email].filter(Boolean).join(' · ') || 'a member with no name on file';
}

/**
 * An owner claim is self-declared, and approving it opens the owners-only
 * section of the website (§718.111(12)(g) / §720.303(4)), so the reviewer sees
 * what the roster says about the unit before approving (audit 2026-11-05, M-6).
 */
function OwnerRosterCheck({ request }: { request: PendingRequest }) {
  const owners = request.recordedOwners ?? [];
  const warn = !request.unitOnRoster || owners.length > 0;
  const Icon = warn ? AlertTriangle : Info;
  let message: string;
  if (!request.unitOnRoster) {
    message =
      'This unit is not on your roster. Approving gives owner access without a unit; check their ownership first, then assign a unit in Directory.';
  } else if (owners.length > 0) {
    message = `Your roster already records ${owners.map(ownerLabel).join(', ')} as ${
      owners.length === 1 ? 'the owner' : 'owners'
    } of this unit. Approving adds another owner.`;
  } else {
    message =
      'On your roster, with no owner recorded yet. Check this person against your ownership records; approving links them to this unit as its owner.';
  }
  return (
    <div
      className={
        warn
          ? 'mt-2 flex gap-2 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-content'
          : 'mt-2 flex gap-2 rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-sm text-content'
      }
    >
      <Icon
        className={warn ? 'mt-0.5 h-4 w-4 flex-none text-status-warning' : 'mt-0.5 h-4 w-4 flex-none text-status-info'}
        aria-hidden="true"
      />
      <p>
        <span className="font-medium">{warn ? 'Check before approving. ' : 'Roster check. '}</span>
        {message}
      </p>
    </div>
  );
}

export function AdminReviewList({ communityId }: { communityId?: number } = {}) {
  const [actingId, setActingId] = useState<number | null>(null);
  const [denyDraftId, setDenyDraftId] = useState<number | null>(null);
  const [denyNotes, setDenyNotes] = useState('');

  const { data, isLoading, isError } = useAdminJoinRequests({ communityId });
  const act = useReviewJoinRequest(communityId);

  const runReview = (input: ReviewJoinRequestInput) => {
    setActingId(input.id);
    act.mutate(input, {
      onSettled: () => {
        setActingId(null);
        setDenyDraftId(null);
        setDenyNotes('');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load join requests"
        description="Please refresh the page to try again."
      />
    );
  }

  const requests = data ?? [];

  // The list holds pending requests only, so an empty one cannot tell "none
  // ever arrived" (every brand-new community) from "all reviewed". The copy
  // must be true for both: "All join requests have been reviewed." was false
  // on day one.
  if (requests.length === 0) {
    return (
      <EmptyState
        size="section"
        illustration={<PropScene size="section" prop="bell" />}
        title="No requests waiting"
        description="People with a PropertyPro account can ask to join with their unit number. Their requests appear here for you to approve or deny."
      />
    );
  }

  return (
    <div className="space-y-3">
      {act.error && (
        <AlertBanner
          status="danger"
          title="Action failed"
          description="We couldn't save your review. Please try again."
        />
      )}
      {requests.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.unitIdentifier}</p>
              {r.requesterName || r.requesterEmail ? (
                <p className="mt-1 text-sm text-content">
                  {[r.requesterName, r.requesterEmail].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {r.residentType === 'owner' ? (
                <OwnerRosterCheck request={r} />
              ) : (
                <p className="mt-1 text-sm text-content-secondary">
                  {r.unitOnRoster
                    ? 'On your roster. Approving links them to this unit.'
                    : 'Not on your roster. Approving gives access without a unit; assign one in Directory.'}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline">{r.residentType}</Badge>
                <span className="text-xs text-content-secondary">
                  Submitted {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="secondary"
                disabled={actingId === r.id}
                onClick={() => {
                  setDenyDraftId(r.id);
                  setDenyNotes('');
                }}
              >
                Deny
              </Button>
              <Button
                size="sm"
                disabled={actingId === r.id}
                onClick={() => runReview({ id: r.id, action: 'approve' })}
              >
                {actingId === r.id ? 'Working…' : 'Approve'}
              </Button>
            </div>
          </div>
          {denyDraftId === r.id && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <label
                htmlFor={`deny-notes-${r.id}`}
                className="text-sm font-medium"
              >
                Reason for denying (sent to requester)
              </label>
              <textarea
                id={`deny-notes-${r.id}`}
                className="w-full min-h-[72px] rounded-md border border-edge bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                placeholder="e.g. Unit number doesn't match our records. Please provide your lease or closing document."
                value={denyNotes}
                onChange={(e) => setDenyNotes(e.target.value)}
                maxLength={500}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actingId === r.id}
                  onClick={() => {
                    setDenyDraftId(null);
                    setDenyNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actingId === r.id}
                  onClick={() =>
                    runReview({
                      id: r.id,
                      action: 'deny',
                      notes: denyNotes.trim() || undefined,
                    })
                  }
                >
                  {actingId === r.id ? 'Denying…' : 'Confirm deny'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

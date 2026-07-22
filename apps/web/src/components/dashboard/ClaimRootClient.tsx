'use client';

/**
 * Claim-root screen body (role-v3 Phase 2b). Two surfaces in one client
 * component, both driven by `useMyRootless`:
 *
 * 1. **Claim list** — every community where the caller is a rootless
 *    property_manager, each with a "Claim" button, plus a "Claim all" button.
 *    Per-community results (claimed / already claimed / error) render inline.
 *
 * 2. **Dispute card** — when `?dispute=<communityId>` is present (the
 *    `RootClaimedEmail` link target), a confirm card to dispute that claim,
 *    wired to `useDisputeRootClaim`. This closes the dispute loop.
 *
 * All `/api/v1` access goes through the hooks (never raw fetch in the
 * component) — `guard:component-api-calls`.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMyRootless,
  useClaimRoot,
  useDisputeRootClaim,
  type ClaimResult,
  type DisputeResult,
} from '@/hooks/use-claim-root';

function claimResultLabel(result: ClaimResult): { status: 'success' | 'warning' | 'danger'; text: string } {
  if (result.claimed) {
    return { status: 'success', text: 'Claimed — you are now the root manager.' };
  }
  if (result.reason === 'already_claimed') {
    return { status: 'warning', text: 'Already claimed by another manager.' };
  }
  return { status: 'danger', text: 'Could not claim — please try again.' };
}

function disputeResultLabel(result: DisputeResult): { status: 'success' | 'warning' | 'info'; text: string } {
  if (!result.disputed) {
    return { status: 'info', text: 'No current root manager — there is nothing to dispute.' };
  }
  if (result.alreadyOpen) {
    return { status: 'warning', text: 'A dispute is already open for this community.' };
  }
  return { status: 'success', text: 'Dispute opened. We’ve sent it to the platform team for review.' };
}

export function ClaimRootClient() {
  const searchParams = useSearchParams();
  const disputeParam = searchParams.get('dispute');
  const disputeCommunityId = disputeParam ? Number(disputeParam) : null;
  const hasDispute = disputeCommunityId != null && Number.isInteger(disputeCommunityId) && disputeCommunityId > 0;

  const { data: rootless, isLoading, isError, error } = useMyRootless();
  const claimRoot = useClaimRoot();
  const disputeClaim = useDisputeRootClaim();

  // Per-community claim results keyed by communityId (single + claim-all).
  const [results, setResults] = useState<Record<number, ClaimResult>>({});

  const disputeCommunityName = useMemo(() => {
    if (!hasDispute) return null;
    return rootless?.find((c) => c.id === disputeCommunityId)?.name ?? null;
  }, [hasDispute, rootless, disputeCommunityId]);

  function recordResults(next: ClaimResult[]) {
    setResults((prev) => {
      const merged = { ...prev };
      for (const r of next) merged[r.communityId] = r;
      return merged;
    });
  }

  async function handleClaimOne(communityId: number) {
    const out = await claimRoot.mutateAsync({ communityId });
    recordResults(out);
  }

  async function handleClaimAll() {
    const out = await claimRoot.mutateAsync({ claimAll: true });
    recordResults(out);
  }

  return (
    <div className="space-y-6">
      {/* ── Dispute card (closes the dispute loop) ── */}
      {hasDispute && (
        <DisputeCard
          communityName={disputeCommunityName}
          isPending={disputeClaim.isPending}
          result={disputeClaim.data ?? null}
          isError={disputeClaim.isError}
          errorMessage={disputeClaim.error?.message}
          onConfirm={() => disputeClaim.mutate({ communityId: disputeCommunityId! })}
        />
      )}

      {/* ── Claim list ── */}
      {isLoading ? (
        <div className="space-y-3" data-testid="claim-root-loading">
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      ) : isError ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn’t load your communities"
          description={error?.message ?? 'Please refresh and try again.'}
        />
      ) : !rootless || rootless.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="You’re all set"
          description="None of your communities are missing a root manager right now."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-content-secondary">
              Claiming makes you the root manager. Other managers of the community will be notified.
            </p>
            <Button
              type="button"
              onClick={handleClaimAll}
              loading={claimRoot.isPending}
              data-testid="claim-all"
            >
              Claim all
            </Button>
          </div>

          <ul className="space-y-3">
            {rootless.map((community) => {
              const result = results[community.id];
              const label = result ? claimResultLabel(result) : null;
              return (
                <li
                  key={community.id}
                  data-testid={`rootless-community-${community.id}`}
                  className="rounded-md border border-border p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content">{community.name}</p>
                      <p className="truncate text-xs text-content-secondary">{community.slug}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleClaimOne(community.id)}
                      disabled={claimRoot.isPending || (result?.claimed ?? false)}
                      data-testid={`claim-${community.id}`}
                    >
                      {result?.claimed ? 'Claimed' : 'Claim'}
                    </Button>
                  </div>
                  {label && (
                    <div className="mt-3">
                      <AlertBanner status={label.status} variant="subtle" title={label.text} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface DisputeCardProps {
  communityName: string | null;
  isPending: boolean;
  result: DisputeResult | null;
  isError: boolean;
  errorMessage?: string;
  onConfirm: () => void;
}

function DisputeCard({ communityName, isPending, result, isError, errorMessage, onConfirm }: DisputeCardProps) {
  const label = result ? disputeResultLabel(result) : null;
  return (
    <div
      data-testid="dispute-card"
      className="rounded-md border border-border bg-surface-card p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-content">Dispute this claim?</h2>
          <p className="mt-1 text-sm text-content-secondary">
            {communityName
              ? `Someone claimed the root manager role for ${communityName}.`
              : 'Someone claimed the root manager role for this community.'}{' '}
            If you believe this was a mistake, open a dispute and a platform admin will review it.
          </p>

          {label && (
            <div className="mt-3">
              <AlertBanner status={label.status} variant="subtle" title={label.text} />
            </div>
          )}
          {isError && !label && (
            <div className="mt-3">
              <AlertBanner
                status="danger"
                variant="subtle"
                title="We couldn’t open the dispute"
                description={errorMessage ?? 'Please try again.'}
              />
            </div>
          )}

          {!result && (
            <div className="mt-4">
              <Button
                type="button"
                variant="destructive"
                onClick={onConfirm}
                loading={isPending}
                data-testid="dispute-confirm"
              >
                Dispute this claim
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

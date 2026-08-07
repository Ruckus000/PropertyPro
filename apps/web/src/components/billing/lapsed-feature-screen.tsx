/**
 * LapsedFeatureScreen — shown when a community's subscription has ended and
 * its paid grace window has expired.
 *
 * Distinct from LockedFeatureScreen, which sells an UPGRADE to a community
 * that is paying but on too low a tier. This one asks a former customer to
 * come back, so it must not name a plan tier or a price as though the feature
 * were merely a rung higher — they already had it.
 *
 * Only ADMINS reach this screen. `requireEntitledForAdminRead` short-circuits
 * on `!membership.isAdmin`, so residents keep full read access on a lapsed
 * community and must never see it — that carve-out is how an association
 * retains access to its own records.
 *
 * The copy therefore promises nothing about which surfaces remain readable: for
 * the admin looking at it, none do. It says only that nothing is deleted, which
 * is true, and points at reactivation.
 */
import * as React from 'react';
import { Lock } from 'lucide-react';
import {
  getPlanFeatureCopy,
  type CommunityFeatures,
  type CommunityRole,
} from '@propertypro/shared';
import { canManageBilling } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export interface LapsedFeatureScreenProps {
  featureKey: keyof CommunityFeatures;
  role: CommunityRole | null;
  communityId: number | null;
}

export function LapsedFeatureScreen({
  featureKey,
  role,
  communityId,
}: LapsedFeatureScreenProps) {
  const copy = getPlanFeatureCopy(featureKey);
  const isBillingAdmin = canManageBilling(role);
  const billingHref = communityId
    ? `/settings/billing?communityId=${communityId}`
    : '/settings/billing';

  return (
    <div className="rounded-md border border-edge bg-surface-card p-6 sm:p-8">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-surface-secondary text-content-secondary"
          aria-hidden="true"
        >
          <Lock size={22} />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-content-primary">
            {copy.displayName} is paused
          </h1>
          <p className="text-base text-content-secondary">
            Your subscription ended, so this feature is on hold. Nothing has been
            deleted — everything is restored as soon as you reactivate.
          </p>
        </div>

        {isBillingAdmin ? (
          <div className="flex flex-col items-center gap-2">
            <Button asChild size="lg">
              <Link href={billingHref}>Reactivate subscription</Link>
            </Button>
            <p className="text-xs text-content-tertiary">
              Residents keep their access throughout.
            </p>
          </div>
        ) : (
          <p className="text-sm text-content-secondary">
            Contact your community administrator to reactivate the subscription.
          </p>
        )}
      </div>
    </div>
  );
}

export default LapsedFeatureScreen;

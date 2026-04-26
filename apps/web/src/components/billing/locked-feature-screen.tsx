'use client';

/**
 * LockedFeatureScreen — full-page hero shown when a user lands on a route
 * whose feature is gated behind a higher plan.
 *
 * Atlassian "Try Premium" pattern: hero illustration on the left, value-prop
 * heading + 3-bullet checklist + role-aware CTA on the right. The CTA opens
 * the same `UpgradeDialog` used by the sidebar so the action surface is
 * consistent across entry points.
 */
import * as React from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  findCheapestPlanForFeature,
  getLockedFeatureBehavior,
  getPlanFeatureCopy,
  type AnyCommunityRole,
  type CommunityFeatures,
  type PlanId,
} from '@propertypro/shared';
import { PlanBadge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { UpgradeDialog } from './upgrade-dialog';

export interface LockedFeatureScreenProps {
  featureKey: keyof CommunityFeatures;
  role: AnyCommunityRole | null;
  currentPlanId: PlanId | null;
  currentPlanRaw: string | null;
  communityId: number | null;
}

export function LockedFeatureScreen({
  featureKey,
  role,
  currentPlanId,
  currentPlanRaw,
  communityId,
}: LockedFeatureScreenProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const copy = getPlanFeatureCopy(featureKey);
  const upgradePlan = findCheapestPlanForFeature(featureKey);
  const behavior = getLockedFeatureBehavior(role);

  const ctaLabel =
    behavior === 'upgrade' ? 'Upgrade now' : 'Notify your board';

  return (
    <div className="rounded-md border border-edge bg-surface-card p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        {/* Hero — placeholder gradient + sparkle icon */}
        <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-[#3B82F6] via-[#6366F1] to-[#8B5CF6] sm:h-72">
          <div className="absolute inset-0 opacity-20" aria-hidden="true">
            <div className="absolute -left-10 -top-10 size-40 rounded-full bg-white blur-3xl" />
            <div className="absolute -right-12 bottom-0 size-48 rounded-full bg-white blur-3xl" />
          </div>
          <Sparkles
            size={88}
            strokeWidth={1.4}
            className="relative text-white drop-shadow-md"
            aria-hidden="true"
          />
        </div>

        {/* Right column — value prop + CTA */}
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PlanBadge variant="pro" tone="light" />
              {upgradePlan && (
                <span className="text-xs font-medium uppercase tracking-wider text-content-tertiary">
                  Available on {upgradePlan.displayName}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-content-primary sm:text-3xl">
              {copy.displayName}
            </h1>
            <p className="text-base text-content-secondary">{copy.tagline}</p>
          </div>

          <ul className="space-y-2">
            {copy.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--interactive-primary)]/12 text-[var(--interactive-primary)]">
                  <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                </span>
                <span className="text-content-primary">{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={() => setDialogOpen(true)} size="lg">
              {ctaLabel}
            </Button>
            {behavior === 'upgrade' && upgradePlan && (
              <p className="text-xs text-content-tertiary sm:ml-2">
                Starting at ${upgradePlan.monthlyPriceUsd}/month
              </p>
            )}
          </div>
        </div>
      </div>

      <UpgradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        featureKey={featureKey}
        currentPlanId={currentPlanId}
        currentPlanRaw={currentPlanRaw}
        role={role}
        communityId={communityId}
      />
    </div>
  );
}

export default LockedFeatureScreen;

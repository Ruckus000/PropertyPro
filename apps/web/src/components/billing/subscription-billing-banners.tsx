'use client';

import Link from 'next/link';
import type { CommunityRole } from '@propertypro/shared';
import {
  billingDaysRemainingUTC,
  canManageBilling,
  formatBillingDateUTC,
  paidGraceEndsAt,
  resolveLifecycleState,
} from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';

export interface SubscriptionBillingBannerProps {
  role: CommunityRole | null;
  communityId: number | null;
  subscriptionStatus: string | null;
  subscriptionCanceledAt: Date | null;
  subscriptionCurrentPeriodEndAt: Date | null;
  freeAccessExpiresAt: Date | null;
  isDemo: boolean;
  now?: Date;
}

function GraceBanner({
  gracePeriodEndsAt,
  billingPortalHref,
  isBillingAdmin,
}: {
  gracePeriodEndsAt: Date;
  billingPortalHref: string;
  isBillingAdmin: boolean;
}) {
  // UTC long-form so this string is byte-identical to the dunning email and the
  // paid-grace lock boundary (all UTC). See formatBillingDateUTC.
  const untilDate = formatBillingDateUTC(gracePeriodEndsAt);
  if (!isBillingAdmin) {
    return (
      <AlertBanner
        status="warning"
        variant="filled"
        title="Your community's subscription was canceled."
        description={`Access continues until ${untilDate}. Contact your community administrator to restore it.`}
      />
    );
  }
  return (
    <AlertBanner
      status="warning"
      variant="filled"
      title="Your subscription was canceled."
      description={`Full access until ${untilDate}. Update payment to keep access active.`}
      action={
        <a
          href={billingPortalHref}
          className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Update Payment
        </a>
      }
    />
  );
}

function SoftLockBanner({
  billingPortalHref,
  isBillingAdmin,
}: {
  billingPortalHref: string;
  isBillingAdmin: boolean;
}) {
  if (!isBillingAdmin) {
    return (
      <AlertBanner
        status="danger"
        variant="filled"
        title="Access paused."
        description="Contact your community administrator to restore access."
      />
    );
  }
  return (
    <AlertBanner
      status="danger"
      variant="filled"
      title="Access paused."
      description="Reactivate your subscription to restore administrative access."
      action={
        <a
          href={billingPortalHref}
          className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Reactivate Subscription
        </a>
      }
    />
  );
}

function TrialingBanner({
  periodEndAt,
  billingHref,
}: {
  periodEndAt: Date;
  billingHref: string;
}) {
  const daysLeft = billingDaysRemainingUTC(periodEndAt);
  const dayLabel = daysLeft === 1 ? 'day' : 'days';

  return (
    <AlertBanner
      status="info"
      variant="filled"
      title="Free trial active"
      description={
        daysLeft > 0
          ? `${daysLeft} ${dayLabel} left in your trial. Your card will be charged when the trial ends unless you cancel.`
          : 'Your trial ends today. Review billing to avoid interruption.'
      }
      action={
        <Link
          href={billingHref}
          className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Manage Billing
        </Link>
      }
    />
  );
}

export function resolveSubscriptionBillingBannerState(
  props: SubscriptionBillingBannerProps,
): {
  showTrialing: boolean;
  showGrace: boolean;
  showSoftLock: boolean;
  showPastDue: boolean;
  isInGrace: boolean;
  isSoftLocked: boolean;
  isBillingAdmin: boolean;
  billingPortalHref: string;
  billingSettingsHref: string;
} {
  const now = props.now ?? new Date();
  // Derived from the same resolver the API guard uses, so the banner can no
  // longer claim access is fine while the guard is 403ing (or vice versa).
  const lifecycle = resolveLifecycleState(
    {
      subscriptionStatus: props.subscriptionStatus,
      subscriptionCanceledAt: props.subscriptionCanceledAt,
      freeAccessExpiresAt: props.freeAccessExpiresAt,
    },
    now,
  );
  const isInGrace = lifecycle === 'grace';
  const isSoftLocked = lifecycle === 'lapsed';
  const billingPortalHref = `/billing/portal${props.communityId ? `?communityId=${props.communityId}` : ''}`;
  const billingSettingsHref = props.communityId
    ? `/settings/billing?communityId=${props.communityId}`
    : '/settings/billing';
  // props.role is the v3 runtime role; canManageBilling reads it directly.
  const isBillingAdmin = canManageBilling(props.role);
  const showTrialing =
    !props.isDemo &&
    props.subscriptionStatus === 'trialing' &&
    isBillingAdmin &&
    props.subscriptionCurrentPeriodEndAt instanceof Date;

  return {
    showTrialing,
    showGrace: isInGrace && props.subscriptionCanceledAt !== null,
    showSoftLock: isSoftLocked,
    showPastDue: props.subscriptionStatus === 'past_due' && isBillingAdmin,
    isInGrace,
    isSoftLocked,
    isBillingAdmin,
    billingPortalHref,
    billingSettingsHref,
  };
}

export function SubscriptionBillingBanners(props: SubscriptionBillingBannerProps) {
  const state = resolveSubscriptionBillingBannerState(props);

  return (
    <>
      {state.showTrialing && props.subscriptionCurrentPeriodEndAt && (
        <div className="px-6 pt-4 lg:px-8">
          <TrialingBanner
            periodEndAt={props.subscriptionCurrentPeriodEndAt}
            billingHref={state.billingSettingsHref}
          />
        </div>
      )}
      {state.showGrace && props.subscriptionCanceledAt && (
        <div className="px-6 pt-4 lg:px-8">
          <GraceBanner
            gracePeriodEndsAt={paidGraceEndsAt(props.subscriptionCanceledAt)}
            billingPortalHref={state.billingPortalHref}
            isBillingAdmin={state.isBillingAdmin}
          />
        </div>
      )}
      {state.showSoftLock && (
        <div className="px-6 pt-4 lg:px-8">
          <SoftLockBanner
            billingPortalHref={state.billingPortalHref}
            isBillingAdmin={state.isBillingAdmin}
          />
        </div>
      )}
      {state.showPastDue && (
        <div className="px-6 pt-4 lg:px-8">
          <AlertBanner
            status="warning"
            variant="filled"
            title="Your subscription payment failed."
            description="Please update your payment method to avoid service interruption."
            action={
              <a
                href={state.billingPortalHref}
                className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Update Payment Method
              </a>
            }
          />
        </div>
      )}
    </>
  );
}

/** Mobile shell variant — same banners without desktop padding wrapper. */
export function SubscriptionBillingBannersMobile(props: SubscriptionBillingBannerProps) {
  const state = resolveSubscriptionBillingBannerState(props);

  return (
    <div className="mobile-billing-banners space-y-2 px-4 pt-3">
      {state.showTrialing && props.subscriptionCurrentPeriodEndAt && (
        <TrialingBanner
          periodEndAt={props.subscriptionCurrentPeriodEndAt}
          billingHref={state.billingSettingsHref}
        />
      )}
      {state.showGrace && props.subscriptionCanceledAt && (
        <GraceBanner
          gracePeriodEndsAt={paidGraceEndsAt(props.subscriptionCanceledAt)}
          billingPortalHref={state.billingPortalHref}
          isBillingAdmin={state.isBillingAdmin}
        />
      )}
      {state.showSoftLock && (
        <SoftLockBanner
          billingPortalHref={state.billingPortalHref}
          isBillingAdmin={state.isBillingAdmin}
        />
      )}
      {state.showPastDue && (
        <AlertBanner
          status="warning"
          variant="filled"
          title="Your subscription payment failed."
          description="Please update your payment method to avoid service interruption."
          action={
            <a
              href={state.billingPortalHref}
              className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Update Payment Method
            </a>
          }
        />
      )}
    </div>
  );
}

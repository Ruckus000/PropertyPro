'use client';

import Link from 'next/link';
import { differenceInCalendarDays } from 'date-fns';
import type { AnyCommunityRole } from '@propertypro/shared';
import {
  canManageBilling,
  inferCanonicalRoleFromMembership,
  isWithinPaidGrace,
  paidGraceEndsAt,
} from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';

const LOCKED_SUBSCRIPTION_STATUSES = new Set([
  'canceled',
  'expired',
  'unpaid',
  'incomplete_expired',
]);

export interface SubscriptionBillingBannerProps {
  role: AnyCommunityRole | null;
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
}: {
  gracePeriodEndsAt: Date;
  billingPortalHref: string;
}) {
  return (
    <AlertBanner
      status="warning"
      variant="filled"
      title="Your subscription was canceled."
      description={`Full access until ${gracePeriodEndsAt.toLocaleDateString()}. Update payment to keep access active.`}
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

function SoftLockBanner({ billingPortalHref }: { billingPortalHref: string }) {
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
  const daysLeft = Math.max(0, differenceInCalendarDays(periodEndAt, new Date()));
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
  billingPortalHref: string;
  billingSettingsHref: string;
} {
  const now = props.now ?? new Date();
  const isInGrace =
    props.subscriptionStatus === 'canceled' &&
    props.subscriptionCanceledAt !== null &&
    isWithinPaidGrace(props.subscriptionCanceledAt, now);
  const freeAccessActive =
    props.freeAccessExpiresAt !== null && props.freeAccessExpiresAt > now;
  const isSoftLocked =
    LOCKED_SUBSCRIPTION_STATUSES.has(props.subscriptionStatus ?? '') &&
    !isInGrace &&
    !freeAccessActive;
  const billingPortalHref = `/billing/portal${props.communityId ? `?communityId=${props.communityId}` : ''}`;
  const billingSettingsHref = props.communityId
    ? `/settings/billing?communityId=${props.communityId}`
    : '/settings/billing';
  const canonicalRole = props.role
    ? inferCanonicalRoleFromMembership({ role: props.role })
    : null;
  const isBillingAdmin = canManageBilling(canonicalRole);
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
          />
        </div>
      )}
      {state.showSoftLock && (
        <div className="px-6 pt-4 lg:px-8">
          <SoftLockBanner billingPortalHref={state.billingPortalHref} />
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
        />
      )}
      {state.showSoftLock && <SoftLockBanner billingPortalHref={state.billingPortalHref} />}
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

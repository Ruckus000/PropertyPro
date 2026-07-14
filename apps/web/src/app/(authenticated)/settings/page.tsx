import React from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';
import { SupportAccessSettings } from '@/components/settings/SupportAccessSettings';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { PageHeader } from '@/components/shared/page-header';
import { checkPermissionV2 } from '@/lib/db/access-control';

/**
 * Settings page — exposes Notification Preferences (P1-26).
 *
 * Uses resolveCommunityContext for consistent tenant resolution
 * across all authenticated pages.
 *
 * RBAC note: The RBAC matrix's 'settings' resource governs community-level
 * settings (branding, configuration), not personal notification preferences.
 * All community members can manage their own notification preferences
 * regardless of role. When community-level settings are added to this page,
 * gate those sections with checkPermission(role, communityType, 'settings', 'read').
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    // Defense in depth — middleware should already have redirected an
    // authenticated user with no tenant context to /select-community. If we
    // somehow reach this branch (e.g. middleware bypass on a static export),
    // bounce to the picker rather than rendering a broken placeholder.
    // Preserve the incoming query string so the picker can hand the user back
    // to e.g. /settings?tab=notifications instead of bare /settings.
    const incomingSearch = toUrlSearchParams(resolvedSearchParams).toString();
    const returnTo = incomingSearch ? `/settings?${incomingSearch}` : '/settings';
    redirect(`/select-community?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);
  const canReadMeetings = checkPermissionV2(
    membership.role,
    membership.communityType,
    'meetings',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  const canReadFinances = checkPermissionV2(
    membership.role,
    membership.communityType,
    'finances',
    'read',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />
      <div>
        <h2 className="mb-2 text-xl font-semibold">Personal Settings</h2>
        <p className="mb-4 text-sm text-content-secondary">
          Manage your account and personal preferences.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/settings/account"
            className="block rounded-lg border border-edge p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
          >
            <h3 className="font-medium text-content">Account</h3>
            <p className="mt-1 text-sm text-content-tertiary">
              Update your name, phone number, and password.
            </p>
          </Link>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-xl font-semibold">Notification Preferences</h2>
        <p className="mb-4 text-sm text-content-secondary">
          Choose which emails you receive and when they should be delivered.
        </p>
        <NotificationPreferencesForm
          communityId={context.communityId}
          reminderVisibility={{
            meetings: canReadMeetings,
            personalAssessments:
              canReadFinances && membership.role === 'resident' && membership.isUnitOwner,
            communityAssessments: canReadFinances && membership.isAdmin,
          }}
        />
      </div>
      <AccessibilitySettings />
      {membership.isAdmin && (
        <div>
          <h2 className="mb-2 text-xl font-semibold">Community Settings</h2>
          <p className="mb-4 text-sm text-content-secondary">
            Manage community-level configuration.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href={`/settings/payments?communityId=${context.communityId}`}
              className="block rounded-lg border border-edge p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
            >
              <h3 className="font-medium text-content">Payment Configuration</h3>
              <p className="mt-1 text-sm text-content-tertiary">
                Connect Stripe, manage payment processing fees, and configure payment settings.
              </p>
            </Link>
            <Link
              href={`/settings/billing?communityId=${context.communityId}`}
              className="block rounded-lg border border-edge p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
            >
              <h3 className="font-medium text-content">Billing &amp; Subscription</h3>
              <p className="mt-1 text-sm text-content-tertiary">
                View your current plan, manage your subscription, and access invoices.
              </p>
            </Link>
          </div>
        </div>
      )}
      {membership.isAdmin && (
        <div>
          <h2 className="mb-2 text-xl font-semibold">Support Access</h2>
          <p className="mb-4 text-sm text-content-secondary">
            Control whether PropertyPro support staff can access this community for troubleshooting.
          </p>
          <SupportAccessSettings communityId={context.communityId} />
        </div>
      )}
    </div>
  );
}

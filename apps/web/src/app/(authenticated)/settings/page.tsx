import React from 'react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';

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
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">Settings</h1>
        <p className="text-sm text-content-secondary">Provide a communityId to edit preferences.</p>
      </>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-xl font-semibold">Notification Preferences</h1>
        <p className="mb-4 text-sm text-content-secondary">
          Choose which emails you receive and when they should be delivered.
        </p>
        <NotificationPreferencesForm communityId={context.communityId} />
      </div>
      <AccessibilitySettings />
      {membership.isAdmin && (
        <div>
          <h2 className="mb-2 text-xl font-semibold">Community Settings</h2>
          <p className="mb-4 text-sm text-gray-600">
            Manage community-level configuration.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href={`/settings/payments?communityId=${context.communityId}`}
              className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <h3 className="font-medium text-gray-900">Payment Configuration</h3>
              <p className="mt-1 text-sm text-gray-500">
                Connect Stripe, manage payment processing fees, and configure payment settings.
              </p>
            </Link>
            <Link
              href={`/settings/billing?communityId=${context.communityId}`}
              className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <h3 className="font-medium text-gray-900">Billing &amp; Subscription</h3>
              <p className="mt-1 text-sm text-gray-500">
                View your current plan, manage your subscription, and access invoices.
              </p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

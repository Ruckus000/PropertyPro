import React from 'react';
import { headers } from 'next/headers';
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';

/**
 * Settings page — exposes Notification Preferences (P1-26).
 *
 * Uses resolveCommunityContext for consistent tenant resolution
 * across all authenticated pages.
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
        <p className="text-sm text-gray-600">Provide a communityId to edit preferences.</p>
      </>
    );
  }

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(context.communityId, userId);

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">Notification Preferences</h1>
      <p className="mb-4 text-sm text-gray-600">
        Choose which emails you receive and when they should be delivered.
      </p>
      <NotificationPreferencesForm communityId={context.communityId} />
    </>
  );
}

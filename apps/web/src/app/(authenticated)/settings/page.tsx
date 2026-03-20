import React from 'react';
import { headers } from 'next/headers';
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
  await requireCommunityMembership(context.communityId, userId);

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
    </div>
  );
}

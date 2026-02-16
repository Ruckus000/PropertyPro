import React from 'react';
import { NotificationPreferencesForm } from '@/components/settings/notification-preferences';

/**
 * Settings page — exposes Notification Preferences (P1-26).
 *
 * Note: In dev, pass communityId via query string. In prod, it is derived
 * from hostname routing and injected via client-side context.
 */
export default function SettingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const raw = searchParams['communityId'];
  const communityId = Number(Array.isArray(raw) ? raw[0] : raw);

  if (!communityId || Number.isNaN(communityId)) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-600">Provide a communityId to edit preferences.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-semibold">Notification Preferences</h1>
      <p className="mb-4 text-sm text-gray-600">
        Choose which emails you receive and when they should be delivered.
      </p>
      <NotificationPreferencesForm communityId={communityId} />
    </div>
  );
}

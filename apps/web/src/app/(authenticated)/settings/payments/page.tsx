'use client';

import { useSearchParams } from 'next/navigation';
import { ConnectStatus } from '@/components/finance/connect-status';
import { FeePolicySettings } from '@/components/finance/fee-policy-settings';

/**
 * Settings → Payments page.
 *
 * Admin-only. Allows board treasurer or CAM to connect their
 * association's Stripe Standard account for payment collection.
 */
export default function PaymentSettingsPage() {
  const searchParams = useSearchParams();
  const communityId = Number(searchParams.get('communityId'));

  if (!communityId || !Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Payment Settings</h1>
        <p className="text-sm text-gray-600">
          Provide a communityId to manage payment settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-xl font-semibold">Payment Settings</h1>
        <p className="mb-6 text-sm text-gray-600">
          Connect your association&apos;s bank account to collect dues and assessments from unit owners.
        </p>
      </div>

      <ConnectStatus communityId={communityId} />

      <FeePolicySettings communityId={communityId} />

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-900">Florida Trust Fund Compliance</h3>
        <p className="mt-1 text-sm text-blue-700">
          Per &sect;718.111(14), each association&apos;s funds must be segregated.
          Your Stripe account is unique to this association &mdash; funds are never commingled
          with other communities or with PropertyPro.
        </p>
      </div>
    </div>
  );
}

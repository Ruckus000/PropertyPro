'use client';

/**
 * ConvertDemoDialog — modal form for converting a demo into a paid customer.
 *
 * Collects plan selection, customer email, and customer name, then calls the
 * web app's conversion endpoint to create a Stripe checkout session.
 */
import { useState } from 'react';
import { PLAN_IDS, PLAN_FEATURES } from '@propertypro/shared';

const PLAN_OPTIONS = PLAN_IDS.map((id) => ({
  id,
  label: PLAN_FEATURES[id].displayName,
  price: PLAN_FEATURES[id].monthlyPriceUsd,
}));

interface ConvertDemoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  prospectName: string;
  webAppBaseUrl: string;
}

export function ConvertDemoDialog({
  isOpen,
  onClose,
  slug,
  prospectName,
  webAppBaseUrl,
}: ConvertDemoDialogProps) {
  const [planId, setPlanId] = useState<string>(PLAN_IDS[0]);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState(prospectName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${webAppBaseUrl}/api/v1/admin/demo/${slug}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, customerEmail, customerName }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message ?? `Request failed (${res.status})`);
      }

      if (json.checkoutUrl) {
        window.open(json.checkoutUrl, '_blank');
        onClose();
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversion');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Convert to Customer</h3>
        <p className="mt-1 text-sm text-gray-500">
          Convert <strong>{prospectName}</strong> from a demo to a paid subscription.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          {/* Plan selection */}
          <div>
            <label htmlFor="convert-plan" className="block text-sm font-medium text-gray-700">
              Plan
            </label>
            <select
              id="convert-plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — ${p.price}/mo
                </option>
              ))}
            </select>
          </div>

          {/* Customer email */}
          <div>
            <label htmlFor="convert-email" className="block text-sm font-medium text-gray-700">
              Customer Email
            </label>
            <input
              id="convert-email"
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Customer name */}
          <div>
            <label htmlFor="convert-name" className="block text-sm font-medium text-gray-700">
              Customer Name
            </label>
            <input
              id="convert-name"
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Association name"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Starting checkout...' : 'Start Checkout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

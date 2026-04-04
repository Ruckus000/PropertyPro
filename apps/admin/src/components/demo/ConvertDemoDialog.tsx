'use client';

/**
 * ConvertDemoDialog — modal form for converting a demo into a paid customer.
 *
 * Collects plan selection, customer email, and customer name, then calls the
 * web app's conversion endpoint to create a Stripe checkout session.
 *
 * A11y: uses native <dialog> element for focus trap, Escape-to-close, and
 * scroll lock. aria-labelledby points to dialog title.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
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
  /** @deprecated No longer needed — conversion route is now same-origin. */
  webAppBaseUrl?: string;
}

export function ConvertDemoDialog({
  isOpen,
  onClose,
  slug,
  prospectName,
}: ConvertDemoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [planId, setPlanId] = useState<string>(PLAN_IDS[0]);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState(prospectName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync open state with native <dialog>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle native close event (Escape key, backdrop click)
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle backdrop click (click on ::backdrop)
  const handleDialogClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/admin/demos/${slug}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, customerEmail, customerName }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message ?? `Request failed (${res.status})`);
      }

      const checkoutUrl = json.data?.checkoutUrl ?? json.checkoutUrl;
      if (checkoutUrl) {
        window.open(checkoutUrl, '_blank');
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

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={handleDialogClick}
      aria-labelledby="convert-dialog-title"
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-xl backdrop:bg-black/50"
    >
      <h3
        id="convert-dialog-title"
        className="text-lg font-semibold text-[var(--text-primary)]"
      >
        Convert to Customer
      </h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Convert <strong>{prospectName}</strong> from a demo to a paid subscription.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
        {/* Plan selection */}
        <div>
          <label htmlFor="convert-plan" className="block text-sm font-medium text-[var(--text-primary)]">
            Plan
          </label>
          <select
            id="convert-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
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
          <label htmlFor="convert-email" className="block text-sm font-medium text-[var(--text-primary)]">
            Customer Email
          </label>
          <input
            id="convert-email"
            type="email"
            required
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
          />
        </div>

        {/* Customer name */}
        <div>
          <label htmlFor="convert-name" className="block text-sm font-medium text-[var(--text-primary)]">
            Customer Name
          </label>
          <input
            id="convert-name"
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Association name"
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--interactive-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]/20"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-[6px] border border-[var(--status-danger)]/20 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-[10px] border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[10px] bg-[var(--status-success)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-success)] focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {submitting ? 'Starting checkout…' : 'Start Checkout'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

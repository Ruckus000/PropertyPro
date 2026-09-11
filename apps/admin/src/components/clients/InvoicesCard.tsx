'use client';

/**
 * The last twelve invoices for one community's Stripe customer.
 *
 * Read-only by construction: there is no refund control here and there is not
 * meant to be one — spec D17 makes a refund a deep link into Stripe, so the
 * money leaves through Stripe's own confirmation and lands in Stripe's own
 * audit trail rather than through a button this console would have to make
 * safe.
 *
 * `getCommunityBilling` treats the invoice list as best-effort and returns `[]`
 * when Stripe's invoice read fails, so an empty list here means "no invoices we
 * could read", not "no invoices exist" — which is why the empty copy points at
 * the Stripe dashboard instead of asserting there are none.
 */
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@propertypro/ui';
import type { CommunityBillingInvoice } from '@/lib/server/billing';
import { formatCentsAsCurrency } from '@/lib/billing/format';

interface InvoicesCardProps {
  invoices: CommunityBillingInvoice[];
  /** Where "see them in Stripe" points when we have nothing to show. */
  stripeDashboardUrl: string;
}

const INVOICE_STATUS_CLASS: Record<string, string> = {
  paid: 'text-status-success',
  open: 'text-status-warning',
  uncollectible: 'text-status-danger',
  void: 'text-content-tertiary',
  draft: 'text-content-tertiary',
};

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function InvoicesCard({ invoices, stripeDashboardUrl }: InvoicesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-content-tertiary">
            No invoices to show.{' '}
            <a
              href={stripeDashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-content-brand hover:underline"
            >
              Check this customer in Stripe
            </a>{' '}
            — the list is best-effort and an unreadable invoice page also lands here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-edge text-sm">
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Date</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Open in Stripe</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-2 font-medium text-content">
                      {invoice.number ?? invoice.id}
                    </td>
                    <td className="px-3 py-2 text-content-secondary">{formatDate(invoice.date)}</td>
                    <td className="px-3 py-2 text-content">
                      {formatCentsAsCurrency(invoice.amountCents)}
                    </td>
                    <td
                      className={`px-3 py-2 ${INVOICE_STATUS_CLASS[invoice.status] ?? 'text-content-secondary'}`}
                    >
                      {invoice.status}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {invoice.hostedUrl ? (
                        <a
                          href={invoice.hostedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-content-brand hover:underline md:min-h-9"
                        >
                          View
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs text-content-disabled">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary"
    >
      {children}
    </th>
  );
}

'use client';

/**
 * FinesSummary — Displays fine history for a violation.
 * Used on the violation detail page to show all fines associated with a case.
 */

import { Section, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import type { ViolationFineItem } from '@/lib/api/violations';

const FINE_STATUS_GLYPHS: Record<string, StatusGlyphKind> = {
  pending: 'attention',
  paid: 'done',
  waived: 'not-started',
};

const FINE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  waived: 'Waived',
};

function toUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

interface FinesSummaryProps {
  fines: ViolationFineItem[];
}

export function FinesSummary({ fines }: FinesSummaryProps) {
  if (fines.length === 0) return null;

  const totalPending = fines
    .filter((f) => f.status === 'pending')
    .reduce((sum, f) => sum + f.amountCents, 0);

  const totalPaid = fines
    .filter((f) => f.status === 'paid')
    .reduce((sum, f) => sum + f.amountCents, 0);

  return (
    <Section>
      <SectionHeader title={`Fines (${fines.length})`} />
      <div className="px-4 py-4">
        {/* Summary row */}
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          {totalPending > 0 && (
            <div className="rounded-md bg-status-warning-bg px-3 py-1.5">
              <span className="text-status-warning">Outstanding: </span>
              <span className="font-semibold text-status-warning">{toUsd(totalPending)}</span>
            </div>
          )}
          {totalPaid > 0 && (
            <div className="rounded-md bg-status-success-bg px-3 py-1.5">
              <span className="text-status-success">Paid: </span>
              <span className="font-semibold text-status-success">{toUsd(totalPaid)}</span>
            </div>
          )}
        </div>

        {/* Fine list */}
        <div className="space-y-3">
          {fines.map((fine) => (
            <div
              key={fine.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-edge-subtle px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium text-content">{toUsd(fine.amountCents)}</span>
                <span className="ml-2 text-content-tertiary">
                  Issued {new Date(fine.issuedAt).toLocaleDateString()}
                </span>
                {fine.paidAt && (
                  <span className="ml-2 text-content-tertiary">
                    &middot; Paid {new Date(fine.paidAt).toLocaleDateString()}
                  </span>
                )}
                {fine.waivedAt && (
                  <span className="ml-2 text-content-tertiary">
                    &middot; Waived {new Date(fine.waivedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <StatusGlyph
                kind={FINE_STATUS_GLYPHS[fine.status] ?? 'not-started'}
                label={FINE_STATUS_LABELS[fine.status] ?? fine.status}
              />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

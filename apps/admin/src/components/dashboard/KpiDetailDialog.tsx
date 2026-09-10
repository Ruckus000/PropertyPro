'use client';

/**
 * KpiDetailDialog — the drill-down modal opened from a `KpiGrid` card.
 *
 * Built on the lifted shadcn `Dialog` (packages/ui) rather than a bespoke
 * modal — same size scale and keyboard/focus behavior as every other dialog
 * in the admin console.
 */
import Link from 'next/link';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@propertypro/ui';
import { cn } from '@/lib/utils';
import type { MonthPoint } from '@/lib/server/dashboard-series';
import { MiniBars } from './MiniBars';

export interface KpiDetailBreakdownRow {
  label: string;
  value: number;
}

interface KpiDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string | number;
  /** Percent change; renders a colored +/- line when present. */
  delta?: number;
  /** Caption naming the period `delta` measures. Defaults to "vs last month". */
  deltaLabel?: string;
  /**
   * When true, a FALLING delta is the good outcome (e.g. Past due) — flips
   * which sign renders success/danger. Must mirror `KpiCard`'s `invertTrend`
   * exactly: a card and the dialog it opens describe the same metric, so a
   * mismatch here is the same defect this component was built to avoid (see
   * the compact card's `invertTrend` prop and `trendConfig` in
   * `packages/ui/src/components/shared/kpi-card.tsx`).
   */
  invertTrend?: boolean;
  description: string;
  series?: MonthPoint[];
  breakdown?: KpiDetailBreakdownRow[];
  ctaHref: string;
  ctaLabel: string;
}

export function KpiDetailDialog({
  open,
  onOpenChange,
  title,
  value,
  delta,
  deltaLabel = 'vs last month',
  invertTrend = false,
  description,
  series,
  breakdown,
  ctaHref,
  ctaLabel,
}: KpiDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <p className="text-3xl font-semibold text-content">{value}</p>
            {delta !== undefined && (
              <p
                className={cn(
                  'pb-1 text-sm font-medium',
                  // A falling delta is good for an inverted metric (Past
                  // due) — same "good/bad by sign, honoring invertTrend"
                  // rule as `KpiCard`'s `trendConfig`, so this dialog can
                  // never contradict the card that opened it.
                  delta === 0
                    ? 'text-content-tertiary'
                    : (invertTrend ? delta < 0 : delta > 0)
                      ? 'text-status-success'
                      : 'text-status-danger',
                )}
              >
                {delta > 0 ? '+' : ''}
                {delta}% {deltaLabel}
              </p>
            )}
          </div>

          {series && series.length > 0 && <MiniBars data={series} />}

          {breakdown && breakdown.length > 0 && (
            <ul role="list" className="divide-y divide-edge rounded-md border border-edge">
              {breakdown.map((row) => (
                <li key={row.label} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-content-secondary">{row.label}</span>
                  <span className="font-medium text-content">{row.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button asChild size="sm">
            <Link href={ctaHref}>{ctaLabel}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

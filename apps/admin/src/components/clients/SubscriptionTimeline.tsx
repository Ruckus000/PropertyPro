'use client';

/**
 * The subscription's own lifecycle dates, newest first.
 *
 * Built by `buildTimeline` in `lib/server/billing.ts` entirely from the Stripe
 * object — there is no stored billing event log, so this is not an activity
 * feed and must not be read as one. It answers "when did this subscription
 * start, when does the trial end, when did collection fail", which is what an
 * operator needs before pressing any of the five action tiles.
 *
 * Dates in the FUTURE are legitimate here (a trial that ends next week, a
 * cancellation scheduled for the period end), which is why every row prints its
 * date rather than a "3 days ago" relative that would read as history.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@propertypro/ui';
import type { SignalTone } from '@/lib/server/signals/types';

export interface TimelineEntry {
  text: string;
  when: string;
  tone: SignalTone;
}

interface SubscriptionTimelineProps {
  entries: TimelineEntry[];
}

const TONE_DOT: Record<SignalTone, string> = {
  danger: 'bg-status-danger',
  warning: 'bg-status-warning',
  info: 'bg-status-info',
  brand: 'bg-status-brand',
  neutral: 'bg-status-neutral',
};

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function SubscriptionTimeline({ entries }: SubscriptionTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-content-tertiary">
            Stripe reports no lifecycle dates for this subscription yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry) => (
              <li key={`${entry.when}-${entry.text}`} className="flex items-start gap-3">
                {/*
                  Tone is never the only signal: the dot is decorative and the
                  row always carries its own words (`design.md`, status rules).
                */}
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[entry.tone]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm text-content">{entry.text}</p>
                  <p className="text-xs text-content-tertiary">{formatWhen(entry.when)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

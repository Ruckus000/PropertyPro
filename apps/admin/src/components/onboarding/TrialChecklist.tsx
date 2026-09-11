import Link from 'next/link';
import { Check, Circle } from 'lucide-react';

import type { PipelineChecklist } from '@/lib/server/onboarding';

interface TrialChecklistProps {
  checklist: PipelineChecklist;
  /** Pre-formatted on the server so the markup does not depend on the viewer's locale. */
  endsAtLabel: string | null;
}

/**
 * The expanded setup checklist for ONE trial — whichever the URL asked for, or
 * the trial ending soonest.
 *
 * ## Done is a shape, not a tint
 *
 * A completed step gets a check GLYPH and the word "Done"; an outstanding one
 * gets an empty circle and "Not started". Strike-through alone would be the same
 * failure as colour alone.
 *
 * ## Why a community with no rows says so
 *
 * A trial whose checklist has never been written renders the "not started"
 * message rather than an empty list, because an empty list reads as "no steps
 * required" — the opposite of the truth.
 */
export function TrialChecklist({ checklist, endsAtLabel }: TrialChecklistProps) {
  const done = checklist.items.filter((i) => i.done).length;

  return (
    <section aria-labelledby="trial-checklist" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="trial-checklist" className="text-sm font-semibold text-content-secondary">
          Setup checklist — {checklist.name}
        </h2>
        <Link
          href={`/clients/${checklist.communityId}`}
          className="rounded-sm text-xs font-medium text-interactive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Open workspace
        </Link>
      </div>

      <div className="rounded-lg border border-edge bg-surface-card p-4 shadow-e1">
        <p className="text-xs text-content-tertiary">
          {done} of {checklist.items.length} steps complete
          {endsAtLabel && ` · ${endsAtLabel}`}
        </p>

        {checklist.items.length === 0 ? (
          <p className="mt-3 text-sm text-content-secondary">
            This community has no checklist rows yet, so setup has not started — not that there is
            nothing to do.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {checklist.items.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-sm">
                {item.done ? (
                  <Check size={15} className="mt-0.5 shrink-0 text-status-success" aria-hidden="true" />
                ) : (
                  <Circle size={15} className="mt-0.5 shrink-0 text-content-tertiary" aria-hidden="true" />
                )}
                <span className={item.done ? 'text-content-tertiary' : 'text-content'}>
                  {item.label}
                </span>
                <span className="ml-auto shrink-0 text-xs text-content-tertiary">{item.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import type { PipelineCard as PipelineCardData } from '@/lib/server/onboarding';

interface PipelineCardProps {
  card: PipelineCardData;
  /** Trials are the only stage with real progress; the rest render no bar. */
  showProgress?: boolean;
}

/**
 * One tile on the pipeline board.
 *
 * ## The blocker is never colour alone
 *
 * A blocked card carries an amber left border, a triangle ICON and the blocker
 * TEXT (`.claude/rules/design.md`). Any one of the three reads on its own, which
 * matters because the border is the only part that survives a glance — and is
 * the only part a colour-blind reader loses.
 *
 * ## The whole card is not a link
 *
 * The NAME is the link. A card-sized anchor wrapping a progress bar and a
 * blocker line gives a screen reader one enormous link label, and gives a mouse
 * user no way to select the text. The `next` line is a label, not a second
 * destination — there is one target per card.
 */
export function PipelineCardTile({ card, showProgress = false }: PipelineCardProps) {
  const blocked = card.blocker !== null;
  return (
    <li
      className={
        blocked
          ? 'rounded-lg border border-edge border-l-4 border-l-status-warning bg-surface-card p-3 shadow-e1'
          : 'rounded-lg border border-edge bg-surface-card p-3 shadow-e1'
      }
    >
      <Link
        href={card.href}
        className="block truncate rounded-sm text-sm font-medium text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {card.name}
      </Link>
      <p className="mt-0.5 truncate text-xs text-content-tertiary">{card.meta}</p>

      {showProgress && (
        <div className="mt-2">
          <div
            role="progressbar"
            aria-valuenow={card.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Onboarding progress for ${card.name}`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            {/* Width is the one thing that cannot be a token — it is the datum.
                An inline style, not an arbitrary Tailwind class: `w-[${pct}%]`
                is assembled at runtime and Tailwind's scanner emits NO rule for
                it, so every bar would render at zero width. */}
            <div className="h-full rounded-full bg-interactive" style={{ width: `${card.pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-content-tertiary">
            {card.steps} steps complete ({card.pct}%)
          </p>
        </div>
      )}

      {blocked && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-status-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{card.blocker}</span>
        </p>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-xs text-content-secondary">
        <ArrowRight size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">Next step: </span>
          {card.next}
        </span>
      </p>
    </li>
  );
}

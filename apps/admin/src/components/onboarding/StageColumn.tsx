import type { PipelineCard, Stage } from '@/lib/server/onboarding';

import { PipelineCardTile } from './PipelineCard';

interface StageColumnProps {
  stage: Stage;
  label: string;
  cards: PipelineCard[];
  /**
   * Mobile shows ONE stage at a time (the segmented control above picks it);
   * from `md` up all four are visible. Both classes are literal — a
   * `${selected ? 'block' : 'hidden'}` template is fine, an assembled CLASS NAME
   * would not be.
   */
  selectedOnMobile: boolean;
}

/**
 * One column of the board: a heading that states its own count, then the cards.
 *
 * The empty branch is deliberately quiet — a stage with nothing in it is the
 * normal state of a healthy pipeline, and a full `EmptyState` with an
 * illustration and a call to action in each of four columns would make an empty
 * board louder than a busy one. The board-level `EmptyState` (all four columns
 * empty) is where the constructive action lives.
 */
export function StageColumn({ stage, label, cards, selectedOnMobile }: StageColumnProps) {
  const blocked = cards.filter((c) => c.blocker !== null).length;
  const headingId = `pipeline-stage-${stage}`;

  return (
    <section
      aria-labelledby={headingId}
      className={`${selectedOnMobile ? 'block' : 'hidden'} space-y-3 md:block`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-sm font-semibold text-content-secondary">
          {label}
        </h2>
        <p className="text-xs text-content-tertiary">
          {cards.length}
          {blocked > 0 && (
            <>
              {' · '}
              <span className="font-medium text-status-warning">{blocked} blocked</span>
            </>
          )}
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge p-4 text-xs text-content-tertiary">
          Nothing at this stage.
        </p>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <PipelineCardTile key={card.id} card={card} showProgress={stage === 'trial'} />
          ))}
        </ul>
      )}
    </section>
  );
}

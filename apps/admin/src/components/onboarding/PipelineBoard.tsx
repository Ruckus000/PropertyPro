'use client';

import { useState } from 'react';

import {
  STAGES,
  STAGE_LABELS,
  type PipelineCard,
  type Stage,
} from '@/lib/server/onboarding';

import { StageColumn } from './StageColumn';

interface PipelineBoardProps {
  stages: Record<Stage, PipelineCard[]>;
}

/**
 * The four-stage board.
 *
 * ## Why a segmented control below `md`, and why it is client-side
 *
 * Four columns side by side need roughly 900 px. At 390 px they become four
 * one-card-wide strips, so mobile shows ONE stage and a control to switch. That
 * choice is per-viewer and instant, which rules out a server round-trip: pushing
 * it into `?stage=` would refetch the whole board to re-render markup the client
 * already has. Every column is rendered either way — `md:block` restores all
 * four above the breakpoint without JavaScript, so a desktop reader sees the
 * whole board even if this component never hydrates.
 *
 * The control uses `aria-pressed` toggle buttons rather than the ARIA tabs
 * pattern on purpose: a real tablist owes the reader arrow-key roving focus and
 * `aria-controls` into panels that are hidden at ONE breakpoint and visible at
 * another. The buttons are honest about what they are.
 */
export function PipelineBoard({ stages }: PipelineBoardProps) {
  const [selected, setSelected] = useState<Stage>('lead');

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-1 rounded-lg border border-edge bg-surface-muted p-1 md:hidden"
        role="group"
        aria-label="Pipeline stage"
      >
        {STAGES.map((stage) => {
          const active = stage === selected;
          const blocked = stages[stage].filter((c) => c.blocker !== null).length;
          return (
            <button
              key={stage}
              type="button"
              // The pressed state is announced, not just tinted — status is
              // never colour alone (`.claude/rules/design.md`).
              aria-pressed={active}
              onClick={() => setSelected(stage)}
              // 44 px minimum, the mobile touch target from design.md. This
              // control only exists below `md`, so the desktop 36 px allowance
              // never applies to it.
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-surface-card text-content shadow-e1'
                  : 'text-content-tertiary hover:text-content'
              }`}
            >
              {STAGE_LABELS[stage]}
              <span className="text-xs text-content-tertiary">{stages[stage].length}</span>
              {blocked > 0 && (
                <span className="sr-only">, {blocked} blocked</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            label={STAGE_LABELS[stage]}
            cards={stages[stage]}
            selectedOnMobile={stage === selected}
          />
        ))}
      </div>
    </div>
  );
}

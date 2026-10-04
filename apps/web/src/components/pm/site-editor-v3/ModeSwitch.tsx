'use client';

import { ListTodo, SquareMousePointer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditorMode } from './tools';

/**
 * The top bar's "Editing mode" switch (v4 Phase 3): Guided or Free edit.
 *
 * Only from 1536px, and only on the Website view (see `EditorTopBar`); below
 * that the switch is the Help drawer's "How you work". Code-split for the
 * editor's first-load budget.
 */
const MODES: readonly { id: EditorMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'guided', label: 'Guided', hint: 'Step-by-step checklist', icon: ListTodo },
  { id: 'free', label: 'Free edit', hint: 'All tools, no checklist', icon: SquareMousePointer },
];

export interface ModeSwitchProps {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}

/** A radio group: one tab stop, arrows move and choose, as the pattern asks. */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  const choose = (next: EditorMode) => {
    if (next !== mode) onModeChange(next);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Editing mode"
      className="hidden shrink-0 gap-0.5 rounded-[var(--radius-md)] bg-surface-muted p-0.5 2xl:flex"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const next = mode === 'guided' ? 'free' : 'guided';
        choose(next);
        event.currentTarget.querySelector<HTMLElement>(`[data-mode="${next}"]`)?.focus();
      }}
    >
      {MODES.map(({ id, label, hint, icon: Icon }) => {
        const checked = id === mode;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={hint}
            data-mode={id}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(id)}
            className={cn(
              'flex h-9 items-center rounded-[var(--radius-sm)] px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              checked
                ? 'bg-surface-card text-content shadow-sm'
                : 'text-content-secondary hover:text-content',
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

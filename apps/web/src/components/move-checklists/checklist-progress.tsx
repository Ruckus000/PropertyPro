/**
 * How far along a move checklist is: the count, the status word, and the bar.
 * Shared by the list cards and the open checklist.
 */
import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { MOVE_IN_STEPS, MOVE_OUT_STEPS } from '@propertypro/db/constants';
import type { MoveChecklistRow } from '@/hooks/use-move-checklists';

export function checklistProgress(checklist: MoveChecklistRow): {
  completed: number;
  total: number;
  kind: StatusGlyphKind;
  word: string;
} {
  const steps = checklist.type === 'move_in' ? MOVE_IN_STEPS : MOVE_OUT_STEPS;
  const completed = steps.filter((s) => checklist.checklistData[s]?.completed).length;
  const total = steps.length;
  if (checklist.completedAt) return { completed, total, kind: 'done', word: 'Complete' };
  if (completed > 0) return { completed, total, kind: 'in-progress', word: 'In progress' };
  return { completed, total, kind: 'not-started', word: 'Not started' };
}

/** "3 of 8 steps done": the number the bar draws, in words. */
export function progressText(completed: number, total: number): string {
  return `${completed} of ${total} steps done`;
}

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    // Decorative: the same figure is always written beside it.
    <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
      <div className="h-full bg-content" style={{ width: `${pct}%` }} />
    </div>
  );
}

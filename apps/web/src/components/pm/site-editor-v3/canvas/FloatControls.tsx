'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePublishedBlocks, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { describeSectionRemoval } from '@/lib/site-editor/describe-section-state';

const ConfirmDialog = dynamic(
  () => import('../ConfirmDialog').then((m) => m.ConfirmDialog),
  { loading: () => null },
);
import { useSiteEditor } from '../editor-context';
import { sectionLabel } from '../section-label';
import { useUndoableRemove } from '../use-undoable-remove';

export interface FloatControlsProps {
  /** The section these controls act on. */
  block: SiteBlockSummary;
  /** Needed by the delete mutation, which is community-scoped. */
  communityId: number;
  className?: string;
}

/**
 * The per-section control cluster: move up, move down, remove.
 *
 * The cluster is **always mounted and always focusable** — it is revealed
 * visually on hover or `focus-within` (see `SectionShell`), never mounted on
 * hover. Mounting on hover is the obvious implementation and it is a keyboard
 * trap: a Tab-only PM can never reach a control that only exists while a mouse
 * is over it, and focus lands on nothing.
 *
 * Ends of the list disable rather than hide their control, so the cluster keeps
 * a stable shape and a stable tab order as sections move. `canMove` comes from
 * the shared editor context, which is the same predicate the Sections panel
 * uses — the two surfaces cannot disagree about what is at the top.
 *
 * Removal is confirmed and then undoable: `useUndoableRemove` owns both halves
 * (see its doc comment for why undo has to replay an upsert).
 */
export function FloatControls({ block, communityId, className }: FloatControlsProps) {
  const { canMove, move, isMoving } = useSiteEditor();
  const { isConfirmOpen, setConfirmOpen, requestRemove, confirmRemove, isPending } =
    useUndoableRemove(communityId, block);

  /*
   * Whether this slot has a PUBLISHED row, which is what decides whether the
   * removal is staged or immediate.
   *
   * The same discriminator the server uses — `site-blocks-service.ts` computes
   * `rows.some((r) => !r.isDraft)` at this slot — read on the client so the
   * confirm dialog can say which of the two things is about to happen. The
   * toast already branched on the server's answer; the dialog asserted both
   * shapes at once and was wrong for every never-published section.
   *
   * Costs no request: `usePublishedBlocks` shares the blocks query key and
   * differs only by `select` (see use-content-blocks.ts).
   *
   * Matched on `(pageId, blockOrder)` rather than on row id, because a section
   * is re-inserted on every write — ids churn, and the draft row's id is not the
   * published row's. `block.pageId` is the page this section belongs to, which
   * is what the server compares too.
   */
  const { data: publishedBlocks } = usePublishedBlocks(communityId);
  const hasPublishedCounterpart = (publishedBlocks ?? []).some(
    (row) => row.pageId === block.pageId && row.blockOrder === block.blockOrder,
  );
  // Focus returns here when the confirm closes — the dialog has no registered
  // Radix trigger because it is mounted on demand. See ConfirmDialog.
  const trashRef = useRef<HTMLButtonElement>(null);

  const label = sectionLabel(block.blockType);

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-[var(--radius-md)] border border-edge bg-surface-card p-1 shadow-sm',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} section up`}
        disabled={isMoving || !canMove(block.id, 'up')}
        onClick={(event) => {
          event.stopPropagation();
          move(block.id, 'up');
        }}
      >
        <ChevronUp aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} section down`}
        disabled={isMoving || !canMove(block.id, 'down')}
        onClick={(event) => {
          event.stopPropagation();
          move(block.id, 'down');
        }}
      >
        <ChevronDown aria-hidden="true" />
      </Button>

      {/* The `display: contents` wrapper adds no box of its own — it exists to
          stop clicks and keys inside the dialog from bubbling to the section
          shell's click-to-select / Alt+Arrow handlers, which a React portal
          otherwise still reaches. */}
      <div
        className="contents"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Button
          ref={trashRef}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${label} section`}
          disabled={isPending}
          onClick={requestRemove}
        >
          <Trash2 aria-hidden="true" className="text-status-danger" />
        </Button>

        {/* Mounted only once opened, and code-split with it: the Radix
            alert-dialog stack is ~31 KiB and this route is within a few KiB of
            a hard 700 KiB budget. Nothing is confirmed before a click, so
            nobody pays for it before then. Focus return is handled by
            ConfirmDialog's `restoreFocusTo` rather than a registered trigger —
            see the note there. */}
        {isConfirmOpen ? (
          <ConfirmDialog
            open
            onOpenChange={setConfirmOpen}
            restoreFocusTo={trashRef}
            title={`Remove the ${label} section?`}
            description={describeSectionRemoval(hasPublishedCounterpart).text}
            confirmLabel="Remove section"
            cancelLabel="Keep section"
            destructive
            pending={isPending}
            onConfirm={confirmRemove}
          />
        ) : null}
      </div>
    </div>
  );
}

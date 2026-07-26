'use client';

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDeleteContentBlock, type SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useSiteEditor } from '../editor-context';
import { sectionLabel } from '../section-label';

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
 */
export function FloatControls({ block, communityId, className }: FloatControlsProps) {
  const { canMove, move, isMoving } = useSiteEditor();
  const remove = useDeleteContentBlock(communityId);

  const label = sectionLabel(block.blockType);

  const handleRemove = () => {
    // Phase 3 replaces this direct delete with a Radix alert-dialog
    // confirmation ("Remove this section?"); until then the toast is the only
    // feedback, and the removal is recoverable by discarding drafts.
    remove.mutate(
      { blockOrder: block.blockOrder },
      {
        onSuccess: ({ staged }) => {
          toast.success(
            staged
              ? `${label} section will be removed when you publish.`
              : `${label} section removed.`,
          );
        },
        onError: (error) => {
          toast.error(`We couldn't remove that section. ${error.message}`);
        },
      },
    );
  };

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

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label} section`}
        disabled={remove.isPending}
        onClick={(event) => {
          event.stopPropagation();
          handleRemove();
        }}
      >
        <Trash2 aria-hidden="true" className="text-status-danger" />
      </Button>
    </div>
  );
}

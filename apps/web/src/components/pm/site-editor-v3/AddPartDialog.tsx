'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddPanel, type AddPanelProps } from './panels/AddPanel';

export interface AddPartDialogProps extends AddPanelProps {
  /** Escape, the close button and an outside click all route through here. */
  onOpenChange: (open: boolean) => void;
  /**
   * Where focus returns when the dialog closes: the "Add a part" button that
   * opened it.
   *
   * Radix restores focus to a registered `DialogTrigger`. This dialog has none
   * on purpose: it is code-split and mounted only while open (`EditorRoot`),
   * so the Radix dialog stack and the catalog stay out of the editor's first
   * load, and every "Add a part" button on the page opens the same dialog.
   * With no trigger Radix would leave focus on `<body>`.
   */
  restoreFocusTo: React.RefObject<HTMLElement | null>;
}

/**
 * "Add a part" (combined plan Task 28): the section catalog in a dialog,
 * adding at the place on the page whose button opened it.
 *
 * Mounted only while open, so it takes no `open` prop. Code-split by
 * `EditorRoot`; `AddPanel` arrives in the same chunk, since the dialog is no
 * use without it.
 */
export function AddPartDialog({ onOpenChange, restoreFocusTo, ...panel }: AddPartDialogProps) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onCloseAutoFocus={(event) => {
          const target = restoreFocusTo.current;
          if (!target?.isConnected) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a part</DialogTitle>
          <DialogDescription>
            Pick what to add. It opens ready to edit, and you can move it later.
          </DialogDescription>
        </DialogHeader>
        <AddPanel {...panel} />
      </DialogContent>
    </Dialog>
  );
}

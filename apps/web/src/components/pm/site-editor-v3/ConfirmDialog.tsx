'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  open: boolean;
  /** Escape, overlay click, and Cancel all route through here. */
  onOpenChange: (open: boolean) => void;
  /**
   * Where focus returns when the dialog closes.
   *
   * Radix normally restores focus to the `AlertDialogTrigger` it registered.
   * This dialog has no trigger on purpose: it is code-split and mounted only
   * once opened, so that the ~31 KiB Radix alert-dialog stack stays out of the
   * editor's initial payload. With no registered trigger, Radix's own restore
   * would drop focus on `<body>` and strand a keyboard PM — so we take over
   * via `onCloseAutoFocus` and put focus back on the control that opened it.
   */
  restoreFocusTo: React.RefObject<HTMLElement | null>;
  title: string;
  description: React.ReactNode;
  /** Verb-first, e.g. "Remove section". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the single filled action as destructive. */
  destructive?: boolean;
  /** Disables the action while the underlying mutation is in flight. */
  pending?: boolean;
  onConfirm: () => void;
}

/**
 * A confirmation over the repo's Radix alert-dialog.
 *
 * Deliberately thin. Radix already traps focus, restores it to the trigger on
 * close, and marks the background inert — a hand-rolled focus trap layered on
 * top would fight all three, so this adds only copy and the destructive
 * treatment. The action carries `buttonVariants({ variant: 'destructive' })`
 * as a className rather than wrapping a `<Button asChild>`: `AlertDialogAction`
 * composes with `cn()`, so tailwind-merge drops the default filled colours,
 * whereas Slot would concatenate both and leave the winner to stylesheet order.
 *
 * One filled action per dialog; Cancel stays outline (from `AlertDialogCancel`).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  restoreFocusTo,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const target = restoreFocusTo.current;
          if (!target?.isConnected) return; // let Radix do whatever it can
          event.preventDefault();
          target.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

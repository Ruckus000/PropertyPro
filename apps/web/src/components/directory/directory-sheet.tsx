'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/use-media-query';

/**
 * Right-hand drawer on tablet and desktop (440px, 480px from xl), bottom sheet
 * on phones. Radix Dialog supplies the focus trap, Esc-to-close (top layer
 * only — an open dialog inside closes first) and focus return.
 */
export function DirectorySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name; the panel paints its own visible heading. */
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const wide = useIsDesktop();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={
          wide
            ? 'flex w-full flex-col gap-0 p-0 motion-reduce:animate-none sm:max-w-none md:w-[440px] xl:w-[480px]'
            : 'flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-t-lg p-0 motion-reduce:animate-none'
        }
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {description ? <SheetDescription className="sr-only">{description}</SheetDescription> : null}
        {wide ? null : (
          <div aria-hidden="true" className="flex justify-center bg-surface-subtle pt-2">
            <span className="h-1 w-10 rounded-full bg-edge-strong" />
          </div>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

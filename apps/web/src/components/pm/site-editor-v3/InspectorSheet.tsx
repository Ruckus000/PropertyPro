'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export interface InspectorSheetProps {
  label: string;
  /**
   * One-line orientation, rendered into `SheetDescription` so Radix has an
   * `aria-describedby` target. Must stay a plain string — see `children`.
   */
  description: string;
  /**
   * The panel body. Rendered as a SIBLING of `SheetHeader`, never inside
   * `SheetDescription`: that renders a `<p>`, and a `<form>` (or any block
   * content) nested in a `<p>` is invalid markup that React re-parents at
   * hydration, detaching the fields from the form element.
   */
  children?: React.ReactNode;
  onClose: () => void;
}

/**
 * The inspector's overlay presentation, in its own module so it can be
 * code-split.
 *
 * This exists for a budget reason, not a structural one. The Radix dialog stack
 * behind `Sheet` is ~27 KiB and is only ever rendered below 1280px, while the
 * editor is phone-gated below 768px — so the overlay serves a narrow band of
 * viewports and the docked column serves everyone else. Keeping it in
 * `Inspector.tsx` put that cost in the initial payload of every PM's editor for
 * a path most of them never take.
 *
 * Radix owns Esc, focus restoration and background inerting here. Do not add a
 * second focus manager.
 */
export function InspectorSheet({
  label,
  description,
  children,
  onClose,
}: InspectorSheetProps) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="flex flex-col gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label} settings</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children ? <div className="min-h-0 flex-1 px-4 pb-4">{children}</div> : null}
      </SheetContent>
    </Sheet>
  );
}

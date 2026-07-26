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
  body: string;
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
export function InspectorSheet({ label, body, onClose }: InspectorSheetProps) {
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
          <SheetDescription>{body}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

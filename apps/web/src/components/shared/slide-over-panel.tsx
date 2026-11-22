'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const widthMap = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[540px]',
  lg: 'sm:max-w-[720px]',
} as const;

interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: keyof typeof widthMap;
  /**
   * Radix refocuses a registered trigger on close, and this panel has none, so
   * left alone focus falls to <body>. A caller that opens the panel from a
   * control passes a handler that calls `preventDefault()` and focuses it.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

export function SlideOverPanel({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
  onCloseAutoFocus,
}: SlideOverPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className={cn('w-full overflow-y-auto', widthMap[width])}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

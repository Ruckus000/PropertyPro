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
}

export function SlideOverPanel({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: SlideOverPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className={cn('w-full overflow-y-auto', widthMap[width])}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

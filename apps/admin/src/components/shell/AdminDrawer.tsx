'use client';

import Link from 'next/link';
import { NavRail, Sheet, SheetContent, SheetTitle } from '@propertypro/ui';
import type { NavSignalKey } from './nav-config';
import { RailFooter } from './RailFooter';
import { toSections } from './AdminRail';

export interface AdminDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeId: string | null;
  counts: Record<NavSignalKey, number>;
  user: { email: string; initial: string };
}

/**
 * Narrow-viewport nav: the same `NavRail` content as `AdminRail`, always
 * rendered expanded, inside a left-side `Sheet`. Selecting an item closes
 * the drawer (`onViewChange`) in addition to the link navigation itself.
 */
export function AdminDrawer({ open, onOpenChange, activeId, counts, user }: AdminDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(300px,84vw)] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <NavRail
          sections={toSections(counts)}
          activeView={activeId ?? ''}
          onViewChange={() => onOpenChange(false)}
          expanded
          renderLink={({ href, children, ...rest }) => (
            <Link href={href} {...rest}>
              {children}
            </Link>
          )}
          footer={<RailFooter user={user} expanded />}
        />
      </SheetContent>
    </Sheet>
  );
}

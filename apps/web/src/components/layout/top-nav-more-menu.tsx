'use client';

/**
 * "More" — the grouped overflow of the top tab bar. A disclosure button over
 * the Radix Popover (Escape closes it and returns focus to the trigger); the
 * trigger's `aria-haspopup="dialog"` comes from Radix, so it is not restated.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { PlanBadge } from '@propertypro/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NavCount } from './top-nav-parts';
import type { TopNavLink, TopNavMoreGroup } from './top-nav-model';

export interface TopNavMoreMenuProps {
  groups: TopNavMoreGroup[];
  hasActive: boolean;
  hasBadge: boolean;
  communityId: number | null;
  /** A plan-locked item was chosen: the parent opens the upgrade dialog. */
  onLockedSelect: (link: TopNavLink) => void;
}

const ITEM_CLASS =
  'flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-content hover:bg-surface-muted';

export function TopNavMoreMenu({ groups, hasActive, hasBadge, onLockedSelect }: TopNavMoreMenuProps) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center gap-1 border-b-2 px-3 text-sm font-medium',
            hasActive
              ? 'border-interactive text-content'
              : 'border-transparent text-content-secondary hover:text-content',
          )}
        >
          More
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
          {hasBadge && (
            <>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-interactive" />
              <span className="sr-only">has updates</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="More pages" className="w-screen max-w-xl p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {groups.map((group) => {
            const labelId = `top-nav-more-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            return (
              <div key={group.label}>
                <p id={labelId} className="mb-1 px-2 font-mono text-xs text-content-secondary">
                  {group.label}
                </p>
                <ul aria-labelledby={labelId} className="space-y-0.5">
                  {group.links.map((link) => (
                    <li key={link.id}>
                      {link.planLocked ? (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          className={ITEM_CLASS}
                          onClick={() => {
                            setOpen(false);
                            onLockedSelect(link);
                          }}
                        >
                          {link.label}
                          <PlanBadge variant="pro" />
                        </button>
                      ) : (
                        <Link
                          href={link.href}
                          aria-current={link.active ? 'page' : undefined}
                          className={cn(ITEM_CLASS, link.active && 'bg-surface-muted font-medium')}
                          onClick={() => setOpen(false)}
                        >
                          {link.label}
                          <NavCount link={link} />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-2 border-t border-edge pt-3 text-sm text-content-secondary">
          Can&apos;t find it? Search every page and record.
          <kbd className="rounded border border-edge bg-surface-page px-1.5 py-0.5 text-xs font-medium text-content-secondary">
            ⌘K
          </kbd>
        </p>
      </PopoverContent>
    </Popover>
  );
}

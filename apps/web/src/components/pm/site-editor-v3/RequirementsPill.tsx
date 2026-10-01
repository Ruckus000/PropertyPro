'use client';

import { useState } from 'react';
import { CircleCheck, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useRequiredSections } from './required-sections-context';
import type { SlotTarget } from './publish/PublishSheet';

export interface RequirementsPillProps {
  /**
   * Fallback only: takes the PM to a hidden section that `showSection` cannot
   * write — `EditorRoot`'s `handleSelectSlot`, the cross-page hand-off the
   * publish sheet's "Fix this" uses. Normally "Show it" un-hides in place, on
   * any page.
   */
  onGoToSection: (target: SlotTarget) => void;
  /** Opens the Add tool, for a required section no page has. */
  onAddSection: () => void;
}

/**
 * The top bar's "Required items" pill (v4 builder, Phase 2).
 *
 * Green when every Florida-required section is on the site and visible, red
 * with one-click fixes when one is hidden or missing. Renders nothing for a
 * community with no requirements (apartments) and while the site is loading —
 * "missing" about a site that has not loaded yet would be false.
 *
 * Below 1280px the label collapses to its icon, as in the design; the trigger
 * keeps an accessible name either way.
 */
export function RequirementsPill({ onGoToSection, onAddSection }: RequirementsPillProps) {
  const { statuses, lawFor, showSection } = useRequiredSections();
  const [open, setOpen] = useState(false);

  if (statuses.length === 0) return null;
  const allSet = statuses.every((s) => s.state === 'visible');
  const label = allSet ? 'Required items: all set' : 'Required item missing';
  const Icon = allSet ? ShieldCheck : ShieldAlert;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          data-testid="requirements-pill"
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            allSet
              ? 'border-status-success-border bg-status-success-bg text-status-success'
              : 'border-status-danger-border bg-status-danger-bg text-status-danger',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Required by Florida law" className="w-[340px] p-3">
        <p className="text-sm font-semibold text-content">Required by Florida law</p>
        <p className="mt-1 text-xs text-content-secondary">
          Keep each of these sections on your website, and not hidden.
        </p>
        <ul className="mt-2 flex flex-col">
          {statuses.map((status) => {
            return (
              <li
                key={status.blockType}
                className="flex items-start gap-2.5 border-t border-edge-subtle py-2.5 first:border-t-0"
              >
                {status.state === 'visible' ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-danger" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium text-content">
                    {status.title}
                    {status.state === 'hidden' ? ' is hidden' : ''}
                    {status.state === 'missing' ? ' is missing' : ''}
                  </span>
                  <span className="block text-xs text-content-tertiary">{lawFor(status.blockType)}</span>
                </span>
                {status.state === 'missing' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="shrink-0"
                    onClick={() => {
                      setOpen(false);
                      onAddSection();
                    }}
                  >
                    Add it
                  </Button>
                ) : null}
                {status.state === 'hidden' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="shrink-0"
                    onClick={() => {
                      setOpen(false);
                      if (!showSection(status.hiddenAt!)) onGoToSection(status.hiddenAt!);
                    }}
                  >
                    Show it
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

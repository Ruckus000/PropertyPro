'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useRequiredSections } from './required-sections-context';
import type { SlotTarget } from './publish/PublishSheet';

// The popover's body: fetched on the first open, not with the top bar.
const RequirementsDetails = dynamic(
  () => import('./RequirementsDetails').then((m) => m.RequirementsDetails),
  { loading: () => null },
);

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
 * Three shapes, by `requirementLevel`:
 *
 *  - `required`: green when every Florida-required section is on the site and
 *    visible, red with one-click fixes when one is hidden or missing. When the
 *    level is required only because the unit count is UNKNOWN, the popover
 *    asks for it — that answer may make the rest moot.
 *  - `recommended` (an association below the statute's size threshold): a
 *    neutral pill that says so, and lets an admin correct the count. No fixes,
 *    because nothing is wrong.
 *  - `none` (apartments): nothing at all.
 *
 * Silent while the site is loading — "missing" about a site that has not loaded
 * yet would be false. Below 1280px the label collapses to its icon; the trigger
 * keeps an accessible name either way.
 */
export function RequirementsPill({ onGoToSection, onAddSection }: RequirementsPillProps) {
  const { level, statuses, threshold } = useRequiredSections();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  if (level === 'none' || threshold === null) return null;

  if (level === 'recommended') {
    const label = 'Florida website rules: not required';
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            title={label}
            data-testid="requirements-pill"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-status-neutral-border bg-status-neutral-bg px-2.5 text-xs font-semibold text-status-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Not required</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-label="Florida website rules" className="w-[340px] p-3">
          <RequirementsDetails
            onClose={close}
            onGoToSection={onGoToSection}
            onAddSection={onAddSection}
          />
        </PopoverContent>
      </Popover>
    );
  }

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
        <RequirementsDetails
          onClose={close}
          onGoToSection={onGoToSection}
          onAddSection={onAddSection}
        />
      </PopoverContent>
    </Popover>
  );
}

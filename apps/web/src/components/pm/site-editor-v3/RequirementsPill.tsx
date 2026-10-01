'use client';

import { useId, useState } from 'react';
import { CircleCheck, Info, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { requiredSectionStatute } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const { level, statuses, lawFor, showSection, subject, threshold, unitCountUnknown } =
    useRequiredSections();
  const [open, setOpen] = useState(false);

  if (level === 'none' || threshold === null) return null;
  const statute = requiredSectionStatute(subject.communityType);

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
          <p className="text-sm font-semibold text-content">Florida website rules</p>
          <p className="mt-1 text-sm text-content-secondary">
            Florida law ({statute}) applies to associations of {threshold.minUnits} or more{' '}
            {threshold.unitNoun}. Yours has {subject.unitCount}, so a Documents section and a
            Meetings section are recommended, not required.
          </p>
          <UnitCountField />
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
        <p className="text-sm font-semibold text-content">Required by Florida law</p>
        {unitCountUnknown ? (
          <p className="mt-1 text-xs text-content-secondary">
            Florida law ({statute}) applies to associations of {threshold.minUnits} or more{' '}
            {threshold.unitNoun}. Until you tell us how many yours has, we treat these sections
            as required.
          </p>
        ) : (
          <p className="mt-1 text-xs text-content-secondary">
            Keep each of these sections on your website, and not hidden.
          </p>
        )}
        <ul className="mt-2 flex flex-col">
          {statuses.map((status) => (
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
          ))}
        </ul>
        <UnitCountField />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The association's size, which decides whether the rules above apply. Asks
 * when unknown, offers "Change" when known; read-only for a non-admin, saying
 * who can change it. Bounds mirror the PATCH contract.
 */
function UnitCountField() {
  const { subject, threshold, unitCountUnknown, canEditUnitCount, saveUnitCount, isSavingUnitCount } =
    useRequiredSections();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const noun = threshold?.unitNoun ?? 'units';

  if (!canEditUnitCount) {
    return (
      <p className="mt-2 border-t border-edge-subtle pt-2.5 text-xs text-content-tertiary">
        {unitCountUnknown
          ? `Ask a community admin to add how many ${noun} the association has.`
          : `Based on ${subject.unitCount} ${noun}. A community admin can change this.`}
      </p>
    );
  }

  if (!unitCountUnknown && !editing) {
    return (
      <p className="mt-2 flex items-center justify-between gap-2 border-t border-edge-subtle pt-2.5 text-xs text-content-tertiary">
        <span>
          Based on {subject.unitCount} {noun}.
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(String(subject.unitCount ?? ''));
            setError(null);
            setEditing(true);
          }}
        >
          Change
        </Button>
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1 || value > 100_000) {
      setError(`Enter a whole number of ${noun}, from 1 to 100,000.`);
      return;
    }
    setError(null);
    try {
      await saveUnitCount(value);
      setEditing(false);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message ? cause.message : 'We could not save that. Try again.',
      );
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 border-t border-edge-subtle pt-2.5" noValidate>
      <label htmlFor={inputId} className="block text-xs font-medium text-content">
        How many {noun} does your association have?
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={100_000}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-9 w-28"
        />
        <Button type="submit" size="sm" disabled={isSavingUnitCount || draft.trim() === ''}>
          {isSavingUnitCount ? 'Saving…' : 'Save'}
        </Button>
        {editing ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

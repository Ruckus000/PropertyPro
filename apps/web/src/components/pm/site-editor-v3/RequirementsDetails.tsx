'use client';

/**
 * The requirements pill's popover body (v4 builder, Phase 2), code-split from
 * the pill in Phase 3.
 *
 * The pill sits in the top bar, so everything it imports is first-load
 * JavaScript for every PM; the explanation, the fixes and the unit-count form
 * are needed only once it is opened. Split out for the editor's web JS
 * budget, which had under 2 KiB of headroom when the Help drawer landed.
 */

import { useId, useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { requiredSectionStatute } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRequiredSections } from './required-sections-context';
import type { SlotTarget } from './publish/PublishSheet';

export interface RequirementsDetailsProps {
  /** Closes the popover before a fix moves the PM elsewhere. */
  onClose: () => void;
  onGoToSection: (target: SlotTarget) => void;
  onAddSection: () => void;
}

export function RequirementsDetails({ onClose, onGoToSection, onAddSection }: RequirementsDetailsProps) {
  const { level, statuses, lawFor, showSection, subject, threshold, unitCountUnknown } =
    useRequiredSections();
  if (threshold === null) return null;
  const statute = requiredSectionStatute(subject.communityType);

  if (level === 'recommended') {
    return (
      <>
        <p className="text-sm font-semibold text-content">Florida website rules</p>
        <p className="mt-1 text-sm text-content-secondary">
          Florida law ({statute}) applies to associations of {threshold.minUnits} or more{' '}
          {threshold.unitNoun}. Yours has {subject.unitCount}, so a Documents section and a
          Meetings section are recommended, not required.
        </p>
        <UnitCountField />
      </>
    );
  }

  return (
    <>
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
                  onClose();
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
                  onClose();
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
    </>
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

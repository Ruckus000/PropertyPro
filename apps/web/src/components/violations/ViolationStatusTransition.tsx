'use client';

/**
 * Status transition inline form for violations.
 * Adapts fields based on the target action: notice, hearing, fine, resolve, dismiss.
 */
import { useCallback, useState } from 'react';
import { format, addDays } from 'date-fns';
import type { ViolationItem } from '@/lib/api/violations';
import { updateViolation, imposeFine, resolveViolation, dismissViolation } from '@/lib/api/violations';

type ActionType = 'notice' | 'hearing' | 'fine' | 'resolve' | 'dismiss';

const ACTION_CONFIG: Record<ActionType, { title: string; notesLabel: string; notesRequired: boolean }> = {
  notice: {
    title: 'Send Violation Notice',
    notesLabel: 'Notice notes (optional)',
    notesRequired: false,
  },
  hearing: {
    title: 'Schedule Hearing',
    notesLabel: 'Hearing notes (optional)',
    notesRequired: false,
  },
  fine: {
    title: 'Impose Fine',
    notesLabel: 'Fine notes (optional)',
    notesRequired: false,
  },
  resolve: {
    title: 'Resolve Violation',
    notesLabel: 'Resolution notes',
    notesRequired: true,
  },
  dismiss: {
    title: 'Dismiss Violation',
    notesLabel: 'Dismissal reason',
    notesRequired: true,
  },
};

interface ViolationStatusTransitionProps {
  violation: ViolationItem;
  communityId: number;
  action: ActionType;
  onComplete: () => void;
  onCancel: () => void;
}

export function ViolationStatusTransition({
  violation,
  communityId,
  action,
  onComplete,
  onCancel,
}: ViolationStatusTransitionProps) {
  const config = ACTION_CONFIG[action];
  const [notes, setNotes] = useState('');
  const [hearingDate, setHearingDate] = useState(
    format(addDays(new Date(), 14), 'yyyy-MM-dd'),
  );
  const [hearingLocation, setHearingLocation] = useState('');
  const [fineAmountDollars, setFineAmountDollars] = useState('');
  const [fineDueDate, setFineDueDate] = useState(
    format(addDays(new Date(), 14), 'yyyy-MM-dd'),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const minHearingDate = format(addDays(new Date(), 14), 'yyyy-MM-dd');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (config.notesRequired && !notes.trim()) {
        setError(`${config.notesLabel} is required.`);
        return;
      }

      if (action === 'fine') {
        const amount = parseFloat(fineAmountDollars);
        if (!amount || amount <= 0) {
          setError('Fine amount must be a positive number.');
          return;
        }
      }

      setSubmitting(true);
      try {
        switch (action) {
          case 'notice': {
            const today = format(new Date(), 'yyyy-MM-dd');
            await updateViolation(violation.id, {
              communityId,
              status: 'noticed',
              noticeDate: today,
              resolutionNotes: notes.trim() || undefined,
            });
            break;
          }
          case 'hearing': {
            await updateViolation(violation.id, {
              communityId,
              status: 'hearing_scheduled',
              hearingDate: new Date(hearingDate).toISOString(),
              resolutionNotes: notes.trim() || undefined,
            });
            break;
          }
          case 'fine': {
            const amountCents = Math.round(parseFloat(fineAmountDollars) * 100);
            await imposeFine(violation.id, {
              communityId,
              amountCents,
              dueDate: fineDueDate,
              notes: notes.trim() || null,
            });
            break;
          }
          case 'resolve': {
            await resolveViolation(violation.id, communityId, notes.trim());
            break;
          }
          case 'dismiss': {
            await dismissViolation(violation.id, communityId, notes.trim());
            break;
          }
        }
        onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [action, violation.id, communityId, notes, hearingDate, fineAmountDollars, fineDueDate, config, onComplete],
  );

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h4 className="text-sm font-semibold text-gray-900">{config.title}</h4>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Hearing-specific fields */}
      {action === 'hearing' && (
        <>
          <div>
            <label htmlFor="hearing-date" className="mb-1 block text-sm font-medium text-gray-700">
              Hearing Date
            </label>
            <input
              id="hearing-date"
              type="date"
              value={hearingDate}
              min={minHearingDate}
              onChange={(e) => setHearingDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Must be at least 14 days from today per Florida bylaw requirements.
            </p>
          </div>
          <div>
            <label htmlFor="hearing-location" className="mb-1 block text-sm font-medium text-gray-700">
              Hearing Location (optional)
            </label>
            <input
              id="hearing-location"
              type="text"
              value={hearingLocation}
              onChange={(e) => setHearingLocation(e.target.value)}
              placeholder="e.g., Community clubhouse, Room 101"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Fine-specific fields */}
      {action === 'fine' && (
        <>
          <div>
            <label htmlFor="fine-amount" className="mb-1 block text-sm font-medium text-gray-700">
              Fine Amount ($)
            </label>
            <input
              id="fine-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={fineAmountDollars}
              onChange={(e) => setFineAmountDollars(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="fine-due-date" className="mb-1 block text-sm font-medium text-gray-700">
              Due Date
            </label>
            <input
              id="fine-due-date"
              type="date"
              value={fineDueDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setFineDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Notes (always shown) */}
      <div>
        <label htmlFor="transition-notes" className="mb-1 block text-sm font-medium text-gray-700">
          {config.notesLabel}
        </label>
        <textarea
          id="transition-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={config.notesRequired ? 'Required — provide a reason for this action.' : 'Optional notes for the audit trail.'}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Processing...' : config.title}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

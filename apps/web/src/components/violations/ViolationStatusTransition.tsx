'use client';

/**
 * Status transition inline form for violations.
 * Adapts fields based on the target action: notice, hearing, fine, resolve, dismiss.
 */
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import type { ViolationItem } from '@/lib/api/violations';

// Editor lazy-loaded so TipTap only ships when this transition form is in
// view. mode='narrow' produces output inside the existing sanitizeHtml
// allowlist exactly.
const Editor = dynamic(
  () => import('@propertypro/ui/editor').then((m) => ({ default: m.Editor })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-edge bg-surface-card px-3 py-3 text-sm text-content-secondary">
        Loading…
      </div>
    ),
  },
);

interface NotesEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

function NotesEditor({ value, onChange, placeholder }: NotesEditorProps) {
  return (
    <Editor
      mode="narrow"
      initialHtml={value}
      onChange={onChange}
      ariaLabel={placeholder ?? 'Notes'}
    />
  );
}
import { updateViolation, imposeFine, resolveViolation, dismissViolation } from '@/lib/api/violations';
import {
  buildHearingNoticeWarning,
  HEARING_NOTICE_DAYS,
} from '@/lib/violations/hearing-notice-warning';

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

  /**
   * Warn, never block.
   *
   * This used to be a `min` attribute on the date input, which browsers enforce
   * as a hard constraint — a board could not schedule an emergency hearing at
   * all, and the rule is a bylaws convention rather than a statutory floor.
   * Worse, `min` is client-only: the server accepted any date, so the "rule"
   * bound the one form that already respected it and nothing else. Now the
   * server computes the same warning (`buildHearingNoticeWarning`), and this
   * calls that same function so the two cannot disagree.
   */
  const hearingNoticeWarning = buildHearingNoticeWarning({
    // Parsed exactly as it will be SUBMITTED (`new Date(hearingDate)` — a bare
    // `yyyy-MM-dd` is UTC midnight), not as local midnight. The two differ by
    // the host's UTC offset, and while the rule's one-day tolerance currently
    // absorbs that, an accidental asymmetry between what the form warns about
    // and what it sends is the kind of thing that only surfaces after someone
    // tightens the tolerance.
    hearingDate: hearingDate ? new Date(hearingDate) : null,
    now: new Date(),
  });

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
            const result = await updateViolation(violation.id, {
              communityId,
              status: 'hearing_scheduled',
              hearingDate: new Date(hearingDate).toISOString(),
              resolutionNotes: notes.trim() || undefined,
            });
            // The form closes on `onComplete()`, taking the live warning with
            // it. Re-raise the server's copy as a toast so the record of a
            // short-noticed hearing outlives the dialog — and so the server's
            // warning is actually reachable rather than computed into a payload
            // nothing reads. Dismiss-only: a compliance warning that fades in
            // four seconds is one the board can honestly say it never saw.
            for (const warning of result.data.warnings ?? []) {
              toast.warning('Hearing scheduled — short notice', {
                description: warning.message,
                duration: Infinity,
                closeButton: true,
              });
            }
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
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-md border border-edge bg-surface-hover p-4">
      <h4 className="text-sm font-semibold text-content">{config.title}</h4>

      {error && (
        <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</div>
      )}

      {/* Hearing-specific fields */}
      {action === 'hearing' && (
        <>
          <div>
            <label htmlFor="hearing-date" className="mb-1 block text-sm font-medium text-content-secondary">
              Hearing Date
            </label>
            <input
              id="hearing-date"
              type="date"
              value={hearingDate}
              onChange={(e) => setHearingDate(e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
            {hearingNoticeWarning ? (
              <p
                role="status"
                data-testid="hearing-notice-window-warning"
                className="mt-1 rounded-md bg-status-warning-bg px-3 py-2 text-xs text-status-warning"
              >
                {hearingNoticeWarning.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-content-disabled">
                Most Florida condo bylaws require at least {HEARING_NOTICE_DAYS} days&apos;
                notice. Check your governing documents.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="hearing-location" className="mb-1 block text-sm font-medium text-content-secondary">
              Hearing Location (optional)
            </label>
            <input
              id="hearing-location"
              type="text"
              value={hearingLocation}
              onChange={(e) => setHearingLocation(e.target.value)}
              placeholder="e.g., Community clubhouse, Room 101"
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>
        </>
      )}

      {/* Fine-specific fields */}
      {action === 'fine' && (
        <>
          <div>
            <label htmlFor="fine-amount" className="mb-1 block text-sm font-medium text-content-secondary">
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
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>
          <div>
            <label htmlFor="fine-due-date" className="mb-1 block text-sm font-medium text-content-secondary">
              Due Date
            </label>
            <input
              id="fine-due-date"
              type="date"
              value={fineDueDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setFineDueDate(e.target.value)}
              className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>
        </>
      )}

      {/* Notes (always shown) */}
      <div>
        <label htmlFor="transition-notes" className="mb-1 block text-sm font-medium text-content-secondary">
          {config.notesLabel}
        </label>
        <NotesEditor
          value={notes}
          onChange={setNotes}
          placeholder={config.notesRequired ? 'Required — provide a reason for this action.' : 'Optional notes for the audit trail.'}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-colors duration-quick hover:bg-interactive-hover disabled:opacity-50"
        >
          {submitting ? 'Processing...' : config.title}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary transition-colors duration-quick hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

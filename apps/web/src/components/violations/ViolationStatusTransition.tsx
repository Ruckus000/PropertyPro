'use client';

/**
 * Status transition inline form for violations.
 * Adapts fields based on the target action: notice, hearing, fine, resolve, dismiss.
 */
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { Section, SectionFooter, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { ViolationItem } from '@/lib/api/violations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
import { utcDateToWallClockValue, wallClockValueToUtcIso } from '@/lib/utils/zoned-datetime';
import { useFiningCommitteeCandidates } from '@/hooks/use-fining-committee';
import {
  FINING_COMMITTEE_MIN_MEMBERS,
  SMALL_COMMITTEE_DISCLAIMER,
  smallCommitteeRule,
} from '@/lib/violations/fining-committee';

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

/** The `datetime-local` value as a UTC ISO instant, or null while it is blank or partial. */
function toHearingIso(value: string, timeZone: string): string | null {
  try {
    return value ? wallClockValueToUtcIso(value, timeZone) : null;
  } catch {
    return null;
  }
}

interface ViolationStatusTransitionProps {
  violation: ViolationItem;
  communityId: number;
  /** IANA zone the hearing time is entered and read in (`membership.timezone`). */
  communityTimezone: string;
  /** The signed-in user; may not sit on the committee for their own fine. */
  actorUserId: string;
  action: ActionType;
  onComplete: () => void;
  onCancel: () => void;
}

export function ViolationStatusTransition({
  violation,
  communityId,
  communityTimezone,
  actorUserId,
  action,
  onComplete,
  onCancel,
}: ViolationStatusTransitionProps) {
  const config = ACTION_CONFIG[action];
  const [notes, setNotes] = useState('');
  // A `datetime-local` value in the COMMUNITY's clock. Defaults to 6 PM fifteen
  // community days out: hearings happen at a time, and fifteen days keeps the
  // default clear of the 14-day warning whatever time the form is opened.
  const [hearingDate, setHearingDate] = useState(
    () => `${utcDateToWallClockValue(addDays(new Date(), 15), communityTimezone).slice(0, 10)}T18:00`,
  );
  const [hearingLocation, setHearingLocation] = useState('');
  const [fineAmountDollars, setFineAmountDollars] = useState('');
  const [fineDueDate, setFineDueDate] = useState(
    format(addDays(new Date(), 14), 'yyyy-MM-dd'),
  );
  const [committeeIds, setCommitteeIds] = useState<string[]>([]);
  const [committeeApproved, setCommitteeApproved] = useState(false);
  const [smallCommitteeAccepted, setSmallCommitteeAccepted] = useState(false);
  const committee = useFiningCommitteeCandidates(communityId, actorUserId, action === 'fine');
  // Below three: refused while three eligible owners exist, else allowed once
  // the disclaimer is accepted. The fine service applies the same rule.
  const committeeRule = smallCommitteeRule(committeeIds.length, (committee.data ?? []).length);
  const committeeReady =
    committeeIds.length > 0
    && committeeApproved
    && (committeeRule === 'ok' || (committeeRule === 'needs_disclaimer' && smallCommitteeAccepted));
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
  const hearingAtIso = toHearingIso(hearingDate, communityTimezone);
  const hearingNoticeWarning = buildHearingNoticeWarning({
    // The exact instant that will be SUBMITTED, so the form and the server's
    // copy of this check cannot disagree.
    hearingDate: hearingAtIso,
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
        if (!committeeReady) {
          setError(
            committeeRule === 'pick_more'
              ? `Select at least ${FINING_COMMITTEE_MIN_MEMBERS} fining committee members.`
              : 'Select the fining committee members, confirm they approved this fine, and accept the disclaimer if shown.',
          );
          return;
        }
      }

      if (action === 'hearing' && !hearingAtIso) {
        setError('Choose a hearing date and time.');
        return;
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
              hearingDate: hearingAtIso,
              hearingLocation: hearingLocation.trim() || null,
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
              approvedByCommittee: true,
              ...(committeeRule === 'needs_disclaimer' ? { smallCommitteeAcknowledged: true as const } : {}),
              committeeMembers: (committee.data ?? [])
                .filter((member) => committeeIds.includes(member.userId))
                .map((member) => ({ userId: member.userId, name: member.name })),
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
    [action, violation.id, communityId, notes, hearingAtIso, hearingLocation, fineAmountDollars, fineDueDate, committeeIds, committeeApproved, committeeReady, committeeRule, committee.data, config, onComplete],
  );

  return (
    <Section>
      <SectionHeader title={config.title} />
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 px-4 py-4">
          {error && (
            <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{error}</div>
          )}

          {/* Hearing-specific fields */}
          {action === 'hearing' && (
            <>
              <div>
                <label htmlFor="hearing-date" className="mb-1 block text-sm font-medium text-content-secondary">
                  Hearing date and time ({communityTimezone})
                </label>
                <Input
                  id="hearing-date"
                  type="datetime-local"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
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
                <Input
                  id="hearing-location"
                  type="text"
                  value={hearingLocation}
                  onChange={(e) => setHearingLocation(e.target.value)}
                  placeholder="e.g., Community clubhouse, Room 101"
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
                <Input
                  id="fine-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={fineAmountDollars}
                  onChange={(e) => setFineAmountDollars(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label htmlFor="fine-due-date" className="mb-1 block text-sm font-medium text-content-secondary">
                  Due Date
                </label>
                <Input
                  id="fine-due-date"
                  type="date"
                  value={fineDueDate}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setFineDueDate(e.target.value)}
                />
              </div>
              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-content-secondary">Fining committee</legend>
                <p className="mb-2 text-xs text-content-tertiary">
                  The owners who approved this fine. Board members and the person imposing the fine cannot serve
                  (Fla. Stat. §718.303(3) / §720.305(2)).
                </p>
                {committee.isLoading ? (
                  <p className="text-sm text-content-tertiary">Loading owners…</p>
                ) : (committee.data ?? []).length === 0 ? (
                  <p className="text-sm text-content-tertiary">No eligible owners found.</p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border border-edge-control bg-surface-card p-2">
                    {(committee.data ?? []).map((member) => (
                      <label key={member.userId} className="flex items-center gap-2 text-sm text-content-secondary">
                        <input
                          type="checkbox"
                          checked={committeeIds.includes(member.userId)}
                          onChange={(e) =>
                            setCommitteeIds((ids) =>
                              e.target.checked ? [...ids, member.userId] : ids.filter((id) => id !== member.userId),
                            )
                          }
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm text-content-secondary">
                  <input
                    type="checkbox"
                    checked={committeeApproved}
                    onChange={(e) => setCommitteeApproved(e.target.checked)}
                  />
                  The fining committee approved this fine
                </label>
                {committeeIds.length > 0 && committeeRule === 'pick_more' && (
                  <p className="mt-2 text-sm text-status-danger">
                    Florida law requires at least {FINING_COMMITTEE_MIN_MEMBERS} committee members. Select{' '}
                    {FINING_COMMITTEE_MIN_MEMBERS - committeeIds.length} more.
                  </p>
                )}
                {committeeIds.length > 0 && committeeRule === 'needs_disclaimer' && (
                  <div role="alert" className="mt-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
                    <p className="text-sm font-medium text-status-warning">
                      Fewer than {FINING_COMMITTEE_MIN_MEMBERS} committee members
                    </p>
                    <p className="mt-1 text-sm text-content-secondary">{SMALL_COMMITTEE_DISCLAIMER}</p>
                    <label className="mt-2 flex items-center gap-2 text-sm text-content-secondary">
                      <input
                        type="checkbox"
                        checked={smallCommitteeAccepted}
                        onChange={(e) => setSmallCommitteeAccepted(e.target.checked)}
                      />
                      I accept this disclaimer
                    </label>
                    <p className="mt-1 text-xs text-content-tertiary">
                      Your name and the time you accept are recorded in the audit log.
                    </p>
                  </div>
                )}
              </fieldset>
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
        </div>

        {/* Action buttons */}
        <SectionFooter>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || (action === 'fine' && !committeeReady)}>
              {submitting ? 'Processing...' : config.title}
            </Button>
          </div>
        </SectionFooter>
      </form>
    </Section>
  );
}

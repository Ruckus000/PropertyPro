'use client';

/**
 * "Doesn't apply" (website builder, D13): a conditional record the association
 * says it doesn't owe, with the reason it gives.
 *
 * A reason is required: one of the choices that fit the record, or "Another
 * reason" with a short note. The server wants 1 to 200 characters
 * (`mark_not_applicable`), so the same limits are checked here, before the
 * request, and a failed save is explained in this dialog in our own words
 * (`useComplianceMutations` reads a top-level `message` the error envelope
 * doesn't carry, so its error text is not shown).
 *
 * Mount it while it is open and unmount it from `onDone`. It saves nothing
 * until the person confirms.
 */
import { useId, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useComplianceMutations } from '@/hooks/use-compliance-mutations';
import type { MissingRecord } from '@/lib/site-editor/records-status';
import { cn } from '@/lib/utils';

/** The server's limit on a reason (`mark_not_applicable`). */
const MAX_REASON_LENGTH = 200;
const OTHER = 'other';

const UNDER_THREE_STORIES = "The building is under three stories";
const NO_BIDDING = 'No bidding period has closed';
const NO_VIDEO = "We don't hold meetings by video";
const NO_CONFLICT_CONTRACTS = 'No contracts with directors or officers';

/** The choices that fit one record, by checklist item. "Another reason" is offered for every item. */
const FIXED_REASONS: Readonly<Record<string, readonly string[]>> = {
  '718_inspection_reports': [UNDER_THREE_STORIES],
  '718_sirs': [UNDER_THREE_STORIES],
  '718_bids': [NO_BIDDING],
  '720_bids': [NO_BIDDING],
  '718_video_recordings': [NO_VIDEO],
  '718_conflict_contracts': [NO_CONFLICT_CONTRACTS],
};

export interface NotApplicableDialogProps {
  communityId: number;
  item: Pick<MissingRecord, 'itemId' | 'templateKey' | 'title'>;
  /** Called when the dialog closes: `true` when the record was marked "Doesn't apply". */
  onDone: (marked: boolean) => void;
}

/** Touch targets: 44 px below 768 px, the default height above. */
const TOUCH = 'min-h-11 md:min-h-9';

export function NotApplicableDialog({ communityId, item, onDone }: NotApplicableDialogProps) {
  const { markNotApplicable } = useComplianceMutations(communityId);
  const fixed = FIXED_REASONS[item.templateKey] ?? [];
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const groupId = useId();
  const noteId = useId();
  const problemId = useId();

  const reason = choice === OTHER ? note.trim() : choice;

  function choose(next: string) {
    setChoice(next);
    setProblem(null);
  }

  async function confirm() {
    if (reason === null || reason.length === 0) {
      setProblem(
        choice === OTHER ? 'Write a few words about why it doesn\'t apply.' : 'Choose a reason, so your board can see it later.',
      );
      return;
    }
    if (reason.length > MAX_REASON_LENGTH) {
      setProblem(`Keep it to ${MAX_REASON_LENGTH} characters or fewer.`);
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await markNotApplicable.mutateAsync({ itemId: item.itemId, reason });
      onDone(true);
    } catch {
      setSaving(false);
      setProblem("We couldn't save that. Please try again.");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onDone(false)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`Doesn't apply: ${item.title}`}</DialogTitle>
          <DialogDescription>
            Tell us why. We keep your reason with this record so your board can see it later.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2" aria-describedby={problem ? problemId : undefined}>
          <legend className="mb-1 text-sm font-medium text-content">Reason</legend>
          {[...fixed, OTHER].map((value) => {
            const id = `${groupId}-${value === OTHER ? 'other' : fixed.indexOf(value)}`;
            return (
              <label
                key={value}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm text-content',
                  TOUCH,
                  choice === value ? 'border-interactive bg-interactive-subtle' : 'border-edge bg-surface-card',
                )}
              >
                <input
                  id={id}
                  type="radio"
                  name={groupId}
                  value={value}
                  checked={choice === value}
                  disabled={saving}
                  onChange={() => choose(value)}
                  className="h-4 w-4 accent-interactive"
                />
                {value === OTHER ? 'Another reason' : value}
              </label>
            );
          })}
        </fieldset>

        {choice === OTHER && (
          <div className="space-y-1">
            <label htmlFor={noteId} className="text-sm font-medium text-content">
              Your reason
            </label>
            <Textarea
              id={noteId}
              value={note}
              maxLength={MAX_REASON_LENGTH}
              rows={3}
              disabled={saving}
              onChange={(event) => {
                setNote(event.target.value);
                setProblem(null);
              }}
            />
            <p className="text-xs text-content-secondary">
              {note.length} of {MAX_REASON_LENGTH} characters
            </p>
          </div>
        )}

        {problem && (
          <p id={problemId} role="alert" className="flex items-start gap-2 text-sm text-status-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{problem}</span>
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className={TOUCH} disabled={saving} onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button className={TOUCH} loading={saving} onClick={() => void confirm()}>
            Mark as not applying
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

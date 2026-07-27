'use client';

/**
 * The urgent notice form. Shared by the desktop tool panel and the phone gate.
 *
 * ## Why one component for both surfaces
 *
 * The phone path is not a reduced version — it is the same write, and posting a
 * closure from a parking lot is the motivating use case for the whole feature.
 * Duplicating the form would eventually mean two different sets of guards on
 * the highest-blast-radius write in the product. Both surfaces load this module
 * lazily, so sharing it costs the editor's initial bundle nothing.
 *
 * ## What this UI does and does not promise
 *
 * `maxLength` on the textarea is a courtesy, not the cap. The real cap is
 * server-side (Zod schema → service → DB CHECK). The counter here exists so a
 * manager knows where they stand, not to enforce anything.
 *
 * There is no "save draft". Posting is immediate and public, and the copy says
 * so before the button is pressed rather than in a toast afterwards.
 */

import { useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  URGENT_NOTICE_MAX_LENGTH,
  isUrgentNoticeActive,
} from '@/lib/site-editor/urgent-notice';
import {
  useSetUrgentNotice,
  useUrgentNotice,
  type UrgentNotice,
} from '@/hooks/use-urgent-notice';
import { ConfirmDialog } from '../ConfirmDialog';
import { useUndoableNoticeRemove } from '../use-undoable-notice-remove';

export interface UrgentNoticeFormProps {
  communityId: number;
  /**
   * Whether the site has ever been published. The server refuses the write
   * either way; this only lets the UI explain why before the manager types 240
   * characters they cannot post.
   */
  hasPublishedSite: boolean;
  /** Server-rendered initial state, so the form is usable on first paint. */
  initialNotice?: UrgentNotice | null;
  /** Tightens spacing on the phone gate. */
  compact?: boolean;
}

/**
 * `datetime-local` speaks local wall-clock time with no zone. A manager typing
 * "6:00 PM" means 6pm where the building is, so interpret it in the browser's
 * zone and hand the server a real instant.
 */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** The inverse, for pre-filling the input from a stored notice. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function UrgentNoticeForm({
  communityId,
  hasPublishedSite,
  initialNotice,
  compact = false,
}: UrgentNoticeFormProps) {
  const { data: notice } = useUrgentNotice(communityId, initialNotice);
  const post = useSetUrgentNotice(communityId);

  const [text, setText] = useState(notice?.text ?? '');
  const [expiryInput, setExpiryInput] = useState(() => isoToLocalInput(notice?.expiresAt ?? null));
  const [error, setError] = useState<string | null>(null);

  // Radix restores focus to a registered trigger; this dialog is code-split and
  // has none, so ConfirmDialog needs somewhere to put focus back. See its docs.
  const removeButtonRef = useRef<HTMLButtonElement | null>(null);
  const remove = useUndoableNoticeRemove(communityId, notice ?? null);

  const remaining = URGENT_NOTICE_MAX_LENGTH - [...text].length;
  const isLive = useMemo(
    () =>
      notice
        ? isUrgentNoticeActive(
            { urgentNoticeText: notice.text, urgentNoticeExpiresAt: notice.expiresAt },
            new Date(),
          )
        : false,
    [notice],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setError('Type the notice you want residents to see.');
      return;
    }
    if ([...trimmed].length > URGENT_NOTICE_MAX_LENGTH) {
      setError(`Notices are limited to ${URGENT_NOTICE_MAX_LENGTH} characters.`);
      return;
    }

    const expiresAt = localInputToIso(expiryInput);
    if (expiryInput && expiresAt === null) {
      setError('That end time isn’t a valid date.');
      return;
    }
    if (expiresAt !== null && new Date(expiresAt).getTime() <= Date.now()) {
      setError('The end time needs to be in the future.');
      return;
    }

    post.mutate(
      { text: trimmed, expiresAt },
      {
        onSuccess: () =>
          toast.success('Urgent notice is live on every page of your website.'),
        // The server owns the refusals that matter — 409 when the site has
        // never been published, 400 on an over-length payload. Surface its
        // message rather than paraphrasing it.
        onError: (mutationError) => setError(mutationError.message),
      },
    );
  }

  if (!hasPublishedSite) {
    return (
      <div
        className="rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-card p-5 text-center"
        data-testid="urgent-notice-unavailable"
      >
        <TriangleAlert
          className="mx-auto mb-2 h-6 w-6 text-content-secondary"
          aria-hidden="true"
        />
        <p className="text-base font-medium text-content">Publish your website first</p>
        <p className="mt-1 text-sm text-content-secondary">
          An urgent notice appears on every page of your public website. There’s nowhere to
          show one until the site has been published at least once.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {notice && (
        <div
          className="rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg p-4"
          data-testid="urgent-notice-current"
        >
          <p className="text-sm font-semibold text-status-danger">
            {isLive ? 'Live on your website now' : 'Expired — no longer showing'}
          </p>
          {/* Text child, same as the public banner. Never set as HTML. */}
          <p className="mt-2 text-base text-content">{notice.text}</p>
          {notice.expiresAt && (
            <p className="mt-2 text-sm text-content-secondary">
              {isLive ? 'Comes down' : 'Came down'} {formatExpiry(notice.expiresAt)}
            </p>
          )}
          <Button
            ref={removeButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={remove.requestRemove}
            disabled={remove.isPending}
          >
            Remove notice
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="urgent-notice-text">
            {notice ? 'Replace the notice' : 'Notice text'}
          </Label>
          <Textarea
            id="urgent-notice-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            // Courtesy only. The cap that matters is enforced server-side.
            maxLength={URGENT_NOTICE_MAX_LENGTH}
            rows={compact ? 3 : 4}
            placeholder="Pool closed through Friday for storm repairs."
            aria-describedby="urgent-notice-counter urgent-notice-immediacy"
            {...(error ? { 'aria-invalid': true } : {})}
          />
          <p
            id="urgent-notice-counter"
            className="text-sm text-content-secondary"
            aria-live="polite"
          >
            {remaining} characters left
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="urgent-notice-expiry">Take it down automatically (optional)</Label>
          <Input
            id="urgent-notice-expiry"
            type="datetime-local"
            value={expiryInput}
            onChange={(event) => setExpiryInput(event.target.value)}
            aria-describedby="urgent-notice-expiry-help"
          />
          <p id="urgent-notice-expiry-help" className="text-sm text-content-secondary">
            Leave this empty and the notice stays up until you remove it.
          </p>
        </div>

        <p id="urgent-notice-immediacy" className="text-sm text-content-secondary">
          Notices go live immediately — they don’t wait for you to publish, and they show on
          every page of your website.
        </p>

        {error && (
          <p role="alert" className="text-sm font-medium text-status-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={post.isPending || text.trim().length === 0}>
          {post.isPending ? 'Posting…' : notice ? 'Replace notice' : 'Post notice'}
        </Button>
      </form>

      <ConfirmDialog
        open={remove.isConfirmOpen}
        onOpenChange={remove.setConfirmOpen}
        restoreFocusTo={removeButtonRef}
        title="Remove the urgent notice?"
        description="It disappears from every page of your website straight away. You'll have a few seconds to undo."
        confirmLabel="Remove notice"
        destructive
        pending={remove.isPending}
        onConfirm={remove.confirmRemove}
      />
    </div>
  );
}

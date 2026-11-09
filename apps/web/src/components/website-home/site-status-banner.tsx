'use client';

/**
 * The website overview's two notices (spec C2): what just happened, and the one
 * thing worth offering about it. Renders nothing when neither applies.
 *
 * - After a publish from the editor (`?published=1`), it says the site has been
 *   updated.
 * - While the one-time "Email owners" offer stands (D10: not sent, not
 *   dismissed, at least one owner) and the site is public (`site_published_at`,
 *   set from the day the community is created), it asks whether to tell
 *   owners. **Email owners** sends once; a refusal from the server (already
 *   sent, dismissed by a colleague, no owners) is shown as the server words it.
 *   **Not now** retires the offer.
 *
 * The site's address, look, last publish and records are the status list's
 * (`site-status-list.tsx`); edits waiting to publish are the overview's draft
 * strip.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSiteLiveNotice, type SendSiteLiveNoticeResult } from '@/hooks/use-site-live-notice';
import { ApiRequestError } from '@/lib/api/request-json';
import { TOUCH } from './touch';

export interface SiteStatusBannerProps {
  communityId: number;
  communityName: string;
  /** Arrived from a publish (`?published=1`). */
  published: boolean;
  /** Show the "Email owners" offer: offerable, and the site is public. */
  offerEmail: boolean;
}

type Note = { tone: 'ok' | 'error'; text: string };

function sentNote(result: SendSiteLiveNoticeResult): Note {
  if (result.status === 'sent') {
    const n = result.recipientCount ?? 0;
    return { tone: 'ok', text: `We emailed ${n} ${n === 1 ? 'owner' : 'owners'} that the website is live.` };
  }
  if (result.status === 'partial') {
    return {
      tone: 'ok',
      text: "Owners can see the news in PropertyPro, but some of the emails didn't go out.",
    };
  }
  return { tone: 'error', text: "We couldn't send the email just now. Please try again." };
}

export function SiteStatusBanner({ communityId, communityName, published, offerEmail }: SiteStatusBannerProps) {
  const router = useRouter();
  const { send, dismiss } = useSiteLiveNotice(communityId);
  const [offerClosed, setOfferClosed] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const busy = send.isPending || dismiss.isPending;
  const showOffer = offerEmail && !offerClosed;

  function refused(error: Error) {
    if (error instanceof ApiRequestError && error.status === 409) {
      // Already sent, dismissed, or no owners: the offer is over either way.
      setOfferClosed(true);
      setNote({ tone: 'error', text: error.message });
      router.refresh();
      return;
    }
    setNote({ tone: 'error', text: "We couldn't do that just now. Please try again." });
  }

  function emailOwners() {
    setNote(null);
    send.mutate(undefined, {
      onSuccess: (result) => {
        setNote(sentNote(result));
        if (result.status !== 'failed') {
          setOfferClosed(true);
          router.refresh();
        }
      },
      onError: refused,
    });
  }

  function notNow() {
    setNote(null);
    dismiss.mutate(undefined, {
      onSuccess: () => {
        setOfferClosed(true);
        router.refresh();
      },
      onError: refused,
    });
  }

  // The status region stays mounted while the offer was ever showing, so what
  // lands in it after the offer closes is still announced.
  if (!published && !offerEmail && note === null) return null;

  return (
    <section
      aria-label="Website notices"
      className="space-y-3 rounded-md border border-edge bg-surface-card p-4"
    >
      {published && (
        <p className="flex items-start gap-2 text-sm font-medium text-content">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
          {`${communityName}'s website has been updated.`}
        </p>
      )}

      {showOffer && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-content">Let owners know their association has a website.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={TOUCH} loading={send.isPending} disabled={busy} onClick={emailOwners}>
              Email owners
            </Button>
            <Button type="button" variant="ghost" className={TOUCH} disabled={busy} onClick={notNow}>
              Not now
            </Button>
          </div>
        </div>
      )}

      {/* Present from the start, so what lands in it is announced. */}
      <div role="status">
        {note && (
          <p
            className={
              note.tone === 'ok'
                ? 'flex items-start gap-2 text-sm text-status-success'
                : 'flex items-start gap-2 text-sm text-status-danger'
            }
          >
            {note.tone === 'ok' ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{note.text}</span>
          </p>
        )}
      </div>
    </section>
  );
}

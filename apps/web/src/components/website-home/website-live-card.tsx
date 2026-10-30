'use client';

/**
 * The dashboard's "Your website is live" card (D18). A new association's site
 * is public from day one, so the dashboard says so, shows the real site, and
 * points at the three things a manager does next: look at it, pick a different
 * look, or open the website home.
 *
 * The page shows it to managers whose plan has the site editor while
 * `site_onboarding_completed_at` is still null. **Dismiss** and the picker's
 * **Keep this look** end that state the same way (`keepCurrent`), with one
 * difference: Dismiss sends the plain form, so a look the manager drafted in
 * the editor is never discarded by closing a card.
 *
 * The preview is the signed-in `/pm/site-preview` frame the look picker uses:
 * lazy, inert, hidden from assistive tech. It is a picture of the site, not a
 * second copy of the links in it.
 */
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKeepCurrentLook } from '@/hooks/use-site-look';
import { LookPreviewFrame } from './look-preview-frame';

interface WebsiteLiveCardProps {
  communityId: number;
  communityName: string;
  /** The site's public address, as the website home shows it. */
  publicUrl: string;
}

/** The page the preview lays out, before it is scaled down to the card. */
const PREVIEW = { width: 1120, height: 800 } as const;

export function WebsiteLiveCard({ communityId, communityName, publicUrl }: WebsiteLiveCardProps) {
  const keepCurrent = useKeepCurrentLook(communityId);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function dismiss() {
    // The plain form: Dismiss closes the card and never touches a drafted look.
    keepCurrent.mutate(
      { withdrawDraftedLook: false },
      {
        onSuccess: () => setDismissed(true),
        onError: () => toast.error("We couldn't dismiss this just now. Please try again."),
      },
    );
  }

  const address = publicUrl.replace(/^https?:\/\//, '');

  return (
    <section
      aria-labelledby="website-live-heading"
      data-testid="website-live-card"
      className="grid gap-5 rounded-md border border-edge bg-surface-card p-5 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 id="website-live-heading" className="text-lg font-semibold text-content">
            Your website is live
          </h2>
          <p className="text-sm text-content-secondary">
            {communityName}&apos;s site is public now, at {address}. Pick a different look
            whenever you like; your text and records stay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href={`/pm/website?communityId=${communityId}`}>Open website home</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              View site
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/pm/website/looks?communityId=${communityId}`}>Pick a different look</Link>
          </Button>
          <Button type="button" variant="ghost" onClick={dismiss} disabled={keepCurrent.isPending}>
            Dismiss
          </Button>
        </div>
      </div>

      <LookPreviewFrame
        communityId={communityId}
        lookId={null}
        title={`${communityName} website preview`}
        width={PREVIEW.width}
        height={PREVIEW.height}
        fit
        className="rounded-sm border border-edge"
      />
    </section>
  );
}

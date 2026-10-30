'use client';

/**
 * The look picker (`/pm/website/looks`, spec C1): the one choice onboarding
 * asks for, and one click to make it live.
 *
 * - "Filled in for you" says what the site already shows. It informs; it never
 *   asks for confirmation. The facts come from the page's loader (D19).
 * - Four look cards, each a preview of the real site in that look. Choosing a
 *   card drafts it (`selectLook`), so leaving and coming back keeps the choice;
 *   nothing public changes. The picker opens on the drafted look, else the live
 *   one, which is marked **Live now**.
 * - A large preview of the chosen look, at computer or phone width.
 * - **Publish this look** publishes at once, with no review screen
 *   (`publishLook`). It is disabled while the live look is chosen, since there
 *   is nothing to publish. **Keep this look** keeps the live look.
 *
 * Look names come from `LOOK_SUMMARIES`, not the registry, so this chunk does
 * not carry every look's default sections.
 */
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, ExternalLink, Info, Monitor, Radio, Smartphone } from 'lucide-react';
import type { CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { useSiteLook } from '@/hooks/use-site-look';
import { ApiRequestError } from '@/lib/api/request-json';
import { LOOK_SUMMARIES, type LookSummary } from '@/lib/site-looks/look-summaries';
import type { LookId } from '@/lib/site-looks/looks';
import type { SiteFacts } from '@/lib/services/website-home-service';
import { cn } from '@/lib/utils';
import { LookPreviewFrame, lookPreviewUrl } from './look-preview-frame';

/** The loader counts meetings and news posts up to this many, so this many reads "50+". */
const LIST_LIMIT = 50;

/** The page each preview lays out, before a card scales it down. */
const PAGE_WIDTH = { computer: 1120, phone: 390 } as const;
const THUMBNAIL = { width: 1120, height: 800 } as const;
/** Tall enough for most home pages; the preview box scrolls over it. */
const PREVIEW_HEIGHT = 2400;

type Device = keyof typeof PAGE_WIDTH;

const TYPE_LABEL: Record<CommunityType, string> = {
  condo_718: 'Condominium',
  hoa_720: 'HOA',
  apartment: 'Apartments',
};
const UNIT_NOUN: Record<CommunityType, [string, string]> = {
  condo_718: ['unit', 'units'],
  hoa_720: ['parcel', 'parcels'],
  apartment: ['unit', 'units'],
};

/** Touch targets: 44 px below 768 px, the default height above. */
const TOUCH = 'min-h-11 md:min-h-9';
/**
 * The publish bar is sticky at the bottom of the page's scroller, so a control
 * scrolled into view by Tab would stop with its bottom edge under the bar
 * (WCAG 2.4.11). Every focusable above the bar keeps a bottom scroll margin
 * taller than the bar: about 190 px stacked below 768 px (14rem is 252 px at
 * the app's 18 px root), about 80 px in one row above (7rem is 126 px).
 */
const CLEARS_BAR = 'scroll-mb-56 md:scroll-mb-28';

export interface LookPickerProps {
  communityId: number;
  facts: SiteFacts;
}

function counted(n: number, one: string, many: string): string {
  if (n >= LIST_LIMIT) return `${LIST_LIMIT}+ ${many}`;
  return `${n} ${n === 1 ? one : many}`;
}

function addressLine(profile: SiteFacts['profile']): string | null {
  const stateZip = [profile.state, profile.zipCode].filter(Boolean).join(' ');
  const parts = [profile.addressLine1, profile.addressLine2, profile.city, stateZip].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function lookName(id: LookId | null): string | null {
  return LOOK_SUMMARIES.find((look) => look.id === id)?.name ?? null;
}

function filledInChips(facts: SiteFacts): string[] {
  const { profile, communityType } = facts;
  const address = addressLine(profile);
  const [one, many] = UNIT_NOUN[communityType];
  const chips = [
    address ? `${profile.name} · ${address}` : profile.name,
    profile.unitCount != null && profile.unitCount > 0
      ? `${profile.unitCount} ${profile.unitCount === 1 ? one : many} · ${TYPE_LABEL[communityType]}`
      : TYPE_LABEL[communityType],
    `${counted(facts.upcomingMeetingCount, 'upcoming meeting', 'upcoming meetings')} · ${counted(facts.newsCount, 'news post', 'news posts')}`,
  ];
  // Only condos and HOAs have records, and only once the checklist exists.
  if (communityType !== 'apartment' && facts.recordsTotal > 0) {
    chips.push(`${facts.recordsPosted} of ${facts.recordsTotal} records found in Documents`);
  }
  chips.push('Welcome photo and message');
  return chips;
}

export function LookPicker({ communityId, facts }: LookPickerProps) {
  const router = useRouter();
  const { selectLook, publishLook, keepCurrent, tokenReady } = useSiteLook(communityId);
  const [selected, setSelected] = useState<LookId | null>(facts.draftLookId ?? facts.liveLookId);
  const [device, setDevice] = useState<Device>('computer');
  // From the click on Keep this look until the page has moved on, so no card
  // or Publish can be used in between (and none is while a draft it waits on lands).
  const [keeping, setKeeping] = useState(false);
  const headingId = useId();

  const liveName = lookName(facts.liveLookId);
  const selectedName = lookName(selected);
  const busy = publishLook.isPending || keeping;
  const canPublish = selected !== null && selected !== facts.liveLookId && tokenReady && !busy;

  function choose(look: LookSummary) {
    if (look.id === selected || busy) return;
    const previous = selected;
    setSelected(look.id);
    selectLook.mutate(look.id, {
      onError: (err) => {
        // Put the card back only if nothing was chosen since.
        setSelected((current) => (current === look.id ? previous : current));
        toast.error(err.message);
      },
    });
  }

  function publish() {
    if (!selected) return;
    publishLook.mutate(selected, {
      onSuccess: (result) => {
        router.push(
          result.publishedAt
            ? `/pm/website?communityId=${communityId}&published=1`
            : `/pm/website?communityId=${communityId}`,
        );
      },
      onError: (err) => {
        toast.error(err.message);
        // Published elsewhere since this page loaded: reload its facts and the
        // publish token, so the next click is checked against the site as it is.
        if (err instanceof ApiRequestError && err.status === 409) router.refresh();
      },
    });
  }

  async function keep() {
    setKeeping(true);
    try {
      // Keeps the live look and takes a drafted one back off, on any live
      // layout (a legacy one included), so it cannot go live with some later,
      // unrelated Publish. The manager's own edits stay drafted.
      await keepCurrent.mutateAsync();
      router.push(`/pm/website?communityId=${communityId}`);
    } catch (err) {
      setKeeping(false);
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  const pending = facts.pendingDraftCount;
  const previewUrl = lookPreviewUrl(communityId, selected);

  return (
    <div className="space-y-8 pb-4">
      <section aria-labelledby={headingId} className="space-y-2">
        <h2 id={headingId} className="text-2xl font-semibold text-content">
          Pick a look for {facts.profile.name}&apos;s website
        </h2>
        <p className="text-base text-content-secondary">
          {liveName
            ? `Your site is already live with ${liveName}. You can change anything later.`
            : 'Your site is already live. You can change anything later.'}
        </p>
      </section>

      <section aria-labelledby={`${headingId}-filled`} className="space-y-3">
        <h3 id={`${headingId}-filled`} className="text-lg font-semibold text-content">
          Filled in for you
        </h3>
        <ul className="flex flex-wrap gap-2">
          {filledInChips(facts).map((chip) => (
            <li
              key={chip}
              className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface-muted px-3 py-1 text-base text-content"
            >
              <Check aria-hidden="true" className="size-4 shrink-0 text-status-success" />
              {chip}
            </li>
          ))}
        </ul>
        <Link
          href={`/settings?communityId=${communityId}#community-profile`}
          className={cn(
            'inline-flex items-center text-base text-interactive underline-offset-4 hover:underline',
            'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            TOUCH,
            CLEARS_BAR,
          )}
        >
          Change these in your Community profile
        </Link>
      </section>

      <section aria-labelledby={`${headingId}-looks`} className="space-y-3">
        <h3 id={`${headingId}-looks`} className="text-lg font-semibold text-content">
          Looks
        </h3>
        {facts.liveLookId === null && (
          <p className="flex items-center gap-2 text-base text-content-secondary">
            <Info aria-hidden="true" className="size-4 shrink-0" />
            Your site uses an older look
          </p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LOOK_SUMMARIES.map((look) => {
            const isSelected = look.id === selected;
            const isLive = look.id === facts.liveLookId;
            const descriptionId = `${headingId}-${look.id}-description`;
            const label = [look.name, isSelected ? 'selected' : null, isLive ? 'live now' : null]
              .filter(Boolean)
              .join(', ');
            return (
              <li
                key={look.id}
                className={cn(
                  // min-w-0: a grid item may shrink below its content, so the card reflows at 320 px.
                  'relative flex min-w-0 flex-col gap-3 rounded-md border bg-surface-card p-3',
                  isSelected ? 'border-interactive ring-2 ring-interactive' : 'border-edge',
                )}
              >
                <LookPreviewFrame
                  communityId={communityId}
                  lookId={look.id}
                  title={`${look.name} preview`}
                  width={THUMBNAIL.width}
                  height={THUMBNAIL.height}
                  fit
                  className="rounded-sm border border-edge"
                />
                {/* The button covers the whole card (after:inset-0), preview included. */}
                <button
                  type="button"
                  aria-label={label}
                  aria-describedby={descriptionId}
                  onClick={() => choose(look)}
                  disabled={busy}
                  className={cn(
                    'flex flex-col items-start gap-1 text-left',
                    'after:absolute after:inset-0 after:rounded-md',
                    'focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus',
                    'disabled:cursor-not-allowed',
                    TOUCH,
                    CLEARS_BAR,
                  )}
                >
                  <span className="text-base font-semibold text-content">{look.name}</span>
                  <span id={descriptionId} className="text-base text-content-secondary">
                    {look.description}
                  </span>
                </button>
                {(isSelected || isLive) && (
                  <div className="flex flex-wrap gap-2" aria-hidden="true">
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-interactive-subtle px-2 py-0.5 text-sm font-medium text-interactive">
                        <Check className="size-4" />
                        Selected
                      </span>
                    )}
                    {isLive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-success-bg px-2 py-0.5 text-sm font-medium text-status-success">
                        <Radio className="size-4" />
                        Live now
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={`${headingId}-preview`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`${headingId}-preview`} className="text-lg font-semibold text-content">
            {selectedName ? `Preview: ${selectedName}` : 'Preview: your site now'}
          </h3>
          <div role="group" aria-label="Preview size" className="inline-flex gap-1 rounded-md border border-edge p-1">
            {(
              [
                ['computer', 'Computer', Monitor],
                ['phone', 'Phone', Smartphone],
              ] as const
            ).map(([value, text, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={device === value}
                onClick={() => setDevice(value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-sm px-3 text-base',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  device === value
                    ? 'bg-interactive-subtle font-semibold text-interactive'
                    : 'text-content-secondary hover:bg-surface-hover',
                  TOUCH,
                  CLEARS_BAR,
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {text}
              </button>
            ))}
          </div>
        </div>
        <div
          role="region"
          aria-label={`${selectedName ?? 'Your site'} on a ${device === 'computer' ? 'computer' : 'phone'}`}
          // Scrolls with the keyboard too: the frame inside is inert.
          tabIndex={0}
          className={cn(
            'max-h-[70vh] overflow-auto rounded-md border border-edge bg-surface-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
            CLEARS_BAR,
          )}
        >
          <LookPreviewFrame
            communityId={communityId}
            lookId={selected}
            title={`${selectedName ?? 'Your site'} preview`}
            width={PAGE_WIDTH[device]}
            height={PREVIEW_HEIGHT}
            className="mx-auto"
          />
        </div>
      </section>

      <div
        data-testid="publish-bar"
        className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-edge bg-surface-card py-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-base">
          <p className="font-medium text-content">Nothing changes until you click Publish</p>
          {pending > 0 && (
            <p className="text-content-secondary">
              {pending === 1
                ? "You also have 1 unpublished edit. It'll publish too."
                : `You also have ${pending} unpublished edits. They'll publish too.`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" className={TOUCH}>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              Open full preview
              <ExternalLink aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
          <Button variant="outline" className={TOUCH} onClick={() => void keep()} disabled={busy} loading={keeping}>
            Keep this look
          </Button>
          <Button className={TOUCH} onClick={publish} disabled={!canPublish} loading={publishLook.isPending}>
            Publish this look
          </Button>
        </div>
      </div>
    </div>
  );
}

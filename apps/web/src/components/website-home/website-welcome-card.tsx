'use client';

/**
 * The website home's simple editor (option 1): a preview of the site beside the
 * two things a board volunteer changes, the welcome words and the photo, and a
 * list of what the site fills in for them from the rest of the app.
 *
 * - **Edit words** opens a two-field form, headline and subtitle, prefilled with
 *   the words as visitors see them (`resolveHeroHeadline` / `resolveLinkedText`,
 *   so `{{name}}` never shows). A field left as it was keeps its stored text,
 *   tokens and all, so it keeps tracking the community's name, city or size.
 * - **Change photo** reuses the editor's `HeroPhotosField`.
 * - Saving goes live (`PATCH /api/v1/pm/site/hero` with `live: true`). Undo, in
 *   the toast and in the status line under the buttons, saves the previous
 *   content back the same way. There is no undo endpoint.
 * - **Filled in for you** lists the sections the site builds from other
 *   features, what each shows now, and a link to where it comes from.
 *
 * Everything here comes from the page's loader (`loadWebsiteHome`); after a
 * save the page is refreshed, so the loader reads the new live welcome.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleAlert, CircleCheck, ImageIcon, Pencil } from 'lucide-react';
import {
  MAX_HERO_PHOTOS,
  heroBlockSchema,
  resolveHeroHeadline,
  resolveHeroPhotos,
  resolveLinkedText,
  type HeroBlockContent,
  type HeroPhoto,
  type LinkedFacts,
} from '@propertypro/shared';
import { HeroPhotosField } from '@/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSaveLiveHero } from '@/hooks/use-hero-block';
import type { SiteFacts } from '@/lib/services/website-home-service';
import { cn } from '@/lib/utils';
import { LookPreviewFrame } from './look-preview-frame';
import { TOUCH } from './touch';

const HEADLINE_MAX = 120;
const SUBTITLE_MAX = 280;
/** The preview's page size before it is scaled into the card. */
const PREVIEW = { width: 1120, height: 800 } as const;
/** The site's facts lists are read up to this many (`SITE_FACTS_LIST_LIMIT`). */
const LIST_LIMIT = 50;

export interface WebsiteWelcomeCardProps {
  communityId: number;
  facts: SiteFacts;
  /** The published hero as stored (`WebsiteHomeData.liveHero`). */
  liveHero: unknown | null;
}

type Mode = 'view' | 'words' | 'photo';

/**
 * The live hero, when it is valid content the route would accept back. A stored
 * hero that fails the schema renders nothing on the public site either; editing
 * the words then replaces it with a plain headline, and offers no Undo.
 */
function parseHero(content: unknown): HeroBlockContent | null {
  const parsed = heroBlockSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}

/** The hero's photos in the stored shape, the legacy single image upgraded (as `HeroForm` does). */
function photosOf(hero: HeroBlockContent | null): HeroPhoto[] {
  if (!hero) return [];
  return resolveHeroPhotos(hero).map((photo): HeroPhoto => {
    if ('stock' in photo) return { stock: photo.stock, alt: photo.alt };
    return photo.decorative === true
      ? { path: photo.path, decorative: true }
      : { path: photo.path, alt: photo.alt ?? '' };
  });
}

/** "3", or "50+" when the list was read to its limit. */
function countText(n: number): string {
  return n >= LIST_LIMIT ? `${LIST_LIMIT}+` : String(n);
}

function plural(n: number, one: string, many: string): string {
  return `${countText(n)} ${n === 1 ? one : many}`;
}

interface FilledRow {
  section: string;
  shows: string;
  source: string;
  href: string;
}

function filledInRows(communityId: number, facts: SiteFacts): FilledRow[] {
  const { profile } = facts;
  const contactParts = [
    profile.addressLine1 ? 'address' : null,
    profile.contactPhone?.trim() ? 'phone' : null,
    profile.contactEmail?.trim() ? 'email' : null,
    profile.officeHours?.trim() ? 'office hours' : null,
  ].filter((part): part is string => part !== null);
  const rows: FilledRow[] = [
    {
      section: 'Meetings',
      shows: facts.upcomingMeetingCount > 0 ? plural(facts.upcomingMeetingCount, 'upcoming meeting', 'upcoming meetings') : 'Nothing yet: hidden until one is scheduled',
      source: 'Meetings',
      href: `/communities/${communityId}/meetings`,
    },
    {
      section: 'News',
      shows: facts.newsCount > 0 ? plural(facts.newsCount, 'post', 'posts') : 'Nothing yet: hidden until you post one',
      source: 'Announcements',
      href: `/announcements?communityId=${communityId}`,
    },
  ];
  if (facts.communityType !== 'apartment' && facts.recordsTotal > 0) {
    rows.push({
      section: 'Records',
      shows: `${facts.recordsPosted} of ${facts.recordsTotal} posted`,
      source: 'Documents',
      href: `/communities/${communityId}/documents`,
    });
  }
  rows.push({
    section: 'Contact',
    shows: contactParts.length > 0 ? `Your ${contactParts.join(', ')}` : 'Nothing yet: hidden until you add details',
    source: 'Community profile',
    href: `/settings?communityId=${communityId}#community-profile`,
  });
  return rows;
}

export function WebsiteWelcomeCard({ communityId, facts, liveHero }: WebsiteWelcomeCardProps) {
  const router = useRouter();
  const saveLive = useSaveLiveHero(communityId);
  const hero = parseHero(liveHero);
  const linked: LinkedFacts = {
    name: facts.profile.name,
    shortName: facts.profile.shortName,
    city: facts.profile.city,
    unitCount: facts.profile.unitCount,
  };
  // What visitors read now. No hero yet reads as the name, as the page's own fallback does.
  const shownHeadline = resolveHeroHeadline(hero?.headline ?? '{{name}}', linked);
  const shownSubtitle = hero?.subtitle ? resolveLinkedText(hero.subtitle, linked) : '';

  const [mode, setMode] = useState<Mode>('view');
  const [headline, setHeadline] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [photos, setPhotos] = useState<HeroPhoto[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  // The last save, while it can be undone: what to put back, and what to say.
  const [done, setDone] = useState<{ message: string; previous: HeroBlockContent | null } | null>(null);
  // A picked photo not uploaded yet: Save waits for it, or it would be dropped.
  const [photoPending, setPhotoPending] = useState(false);
  // The last save's toast, closed when a newer save or an undo lands.
  const lastToast = useRef<string | number | null>(null);
  // Remounts the preview after a save, so it shows the new welcome.
  const [previewVersion, setPreviewVersion] = useState(0);

  const headingId = useId();
  const headlineId = useId();
  const subtitleId = useId();
  const errorId = useId();
  const wordsButton = useRef<HTMLButtonElement>(null);
  const photoButton = useRef<HTMLButtonElement>(null);
  const headlineInput = useRef<HTMLInputElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  // Which button focus goes back to when a form closes. Held by name: the
  // buttons are unmounted while a form is open, so a ref to one is empty then.
  const returnFocus = useRef<'words' | 'photo' | null>(null);

  useEffect(() => {
    if (mode === 'words') headlineInput.current?.focus();
    else if (mode === 'photo') formHeading.current?.focus();
    else if (returnFocus.current) {
      (returnFocus.current === 'words' ? wordsButton : photoButton).current?.focus();
      returnFocus.current = null;
    }
  }, [mode]);

  function openWords() {
    setHeadline(shownHeadline);
    setSubtitle(shownSubtitle);
    setFormError(null);
    setMode('words');
  }

  function openPhoto() {
    setPhotos(photosOf(hero));
    setPhotoPending(false);
    setFormError(null);
    setMode('photo');
  }

  function close(opener: 'words' | 'photo') {
    returnFocus.current = opener;
    setFormError(null);
    setMode('view');
  }

  async function saveContent(next: HeroBlockContent, message: string, opener: 'words' | 'photo') {
    const previous = hero;
    setFormError(null);
    try {
      await saveLive.mutateAsync(next);
    } catch {
      setFormError("We couldn't save that just now. Please try again.");
      return;
    }
    setDone({ message, previous });
    setPreviewVersion((v) => v + 1);
    close(opener);
    // A newer save closes the older toast, so its Undo can never put back a
    // version from before the latest edit. Closed, not reused: sonner merges a
    // reused id's options, which would carry an old Undo onto the new toast.
    if (lastToast.current !== null) toast.dismiss(lastToast.current);
    lastToast.current = previous
      ? toast.success(message, { duration: 10_000, action: { label: 'Undo', onClick: () => void undo(previous) } })
      : toast.success(message);
    router.refresh();
  }

  async function undo(previous: HeroBlockContent) {
    try {
      await saveLive.mutateAsync(previous);
    } catch {
      toast.error("We couldn't undo that just now. Please try again.");
      return;
    }
    setDone(null);
    setPreviewVersion((v) => v + 1);
    if (lastToast.current !== null) toast.dismiss(lastToast.current);
    lastToast.current = null;
    toast.success('Your previous welcome is back.');
    router.refresh();
  }

  function submitWords(event: FormEvent) {
    event.preventDefault();
    const nextHeadline = headline.trim();
    const nextSubtitle = subtitle.trim();
    if (nextHeadline.length === 0) {
      setFormError('Add a headline. It is the first thing people read.');
      headlineInput.current?.focus();
      return;
    }
    // A field left as it was keeps its stored text, so a `{{name}}` it holds
    // keeps tracking the community. Only an edited field is saved as typed.
    const storedHeadline = nextHeadline === shownHeadline ? (hero?.headline ?? '{{name}}') : nextHeadline;
    const storedSubtitle = nextSubtitle === shownSubtitle && hero?.subtitle ? hero.subtitle : nextSubtitle;
    const { subtitle: _old, ...rest } = hero ?? { headline: '' };
    const next = {
      ...rest,
      headline: storedHeadline,
      ...(storedSubtitle.length > 0 ? { subtitle: storedSubtitle } : {}),
    } as HeroBlockContent;
    void saveContent(next, 'Your new welcome words are live.', 'words');
  }

  function submitPhoto(event: FormEvent) {
    event.preventDefault();
    // The legacy single image is replaced by the list, never written beside it.
    const { heroImagePath: _path, heroImageAlt: _alt, photos: _photos, ...rest } = hero ?? {
      headline: '{{name}}',
    };
    const next = { ...rest, ...(photos.length > 0 ? { photos } : {}) } as HeroBlockContent;
    if (photoPending) {
      setFormError('Upload the photo you picked first, or remove it.');
      return;
    }
    if (!heroBlockSchema.safeParse(next).success) {
      setFormError('Each photo needs a short description, or to be marked decorative.');
      return;
    }
    void saveContent(next, 'Your new photo is live.', 'photo');
  }

  const saving = saveLive.isPending;
  const photoCount = photosOf(hero).length;

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-md border border-edge bg-surface-card p-5">
      <h2 id={headingId} className="text-lg font-semibold text-content">
        Your welcome
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <LookPreviewFrame
          // A new key remounts the frame, so a save shows at once.
          key={previewVersion}
          communityId={communityId}
          lookId={null}
          title="Your website's home page"
          width={PREVIEW.width}
          height={PREVIEW.height}
          fit
          className="rounded-sm border border-edge"
        />

        <div className="min-w-0 space-y-4">
          {mode === 'view' && (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium text-content-secondary">Your home page says</p>
                <p className="break-words text-base font-semibold text-content">{shownHeadline}</p>
                {shownSubtitle && <p className="break-words text-base text-content">{shownSubtitle}</p>}
                <p className="text-sm text-content-secondary">
                  {photoCount === 0 ? 'No photo' : photoCount === 1 ? '1 photo' : `${photoCount} photos`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button ref={wordsButton} type="button" variant="outline" className={TOUCH} onClick={openWords}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit words
                </Button>
                <Button ref={photoButton} type="button" variant="outline" className={TOUCH} onClick={openPhoto}>
                  <ImageIcon className="size-4" aria-hidden="true" />
                  Change photo
                </Button>
              </div>
            </>
          )}

          {mode === 'words' && (
            <form className="space-y-4" onSubmit={submitWords} noValidate>
              <div className="space-y-1.5">
                <Label htmlFor={headlineId}>
                  Headline <span aria-hidden="true">*</span>
                </Label>
                <Input
                  ref={headlineInput}
                  id={headlineId}
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  required
                  aria-invalid={formError !== null && headline.trim().length === 0}
                  aria-describedby={formError ? errorId : undefined}
                  onChange={(event) => setHeadline(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={subtitleId}>Subtitle</Label>
                <Textarea
                  id={subtitleId}
                  value={subtitle}
                  maxLength={SUBTITLE_MAX}
                  rows={3}
                  onChange={(event) => setSubtitle(event.target.value)}
                />
              </div>
              <FormError id={errorId} text={formError} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className={TOUCH} loading={saving} disabled={saving}>
                  Save and publish
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={TOUCH}
                  disabled={saving}
                  onClick={() => close('words')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {mode === 'photo' && (
            <form className="space-y-4" onSubmit={submitPhoto} noValidate aria-labelledby={`${headingId}-photo`}>
              <h3
                id={`${headingId}-photo`}
                ref={formHeading}
                tabIndex={-1}
                className="text-base font-semibold text-content outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Change photo
              </h3>
              <p className="text-sm text-content-secondary">
                Upload your photo, then save. Up to {MAX_HERO_PHOTOS} photos.
              </p>
              <HeroPhotosField
                communityId={communityId}
                blockOrder={1}
                photos={photos}
                onChange={setPhotos}
                onPendingChange={setPhotoPending}
              />
              <FormError id={errorId} text={formError} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className={TOUCH} loading={saving} disabled={saving}>
                  Save and publish
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={TOUCH}
                  disabled={saving}
                  onClick={() => close('photo')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Present from the start, so a save or undo that lands in it is announced. */}
          <div role="status">
            {done && mode === 'view' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="flex items-start gap-2 text-sm text-content">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                  {done.message}
                </p>
                {done.previous && (
                  <Button
                    type="button"
                    variant="link"
                    className={cn('h-auto px-0 text-content-link', TOUCH)}
                    disabled={saving}
                    onClick={() => done.previous && void undo(done.previous)}
                  >
                    Undo
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <FilledInList communityId={communityId} facts={facts} />
    </section>
  );
}

function FormError({ id, text }: { id: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm text-status-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

function FilledInList({ communityId, facts }: { communityId: number; facts: SiteFacts }) {
  const headingId = useId();
  return (
    <div className="space-y-2 border-t border-edge-subtle pt-4">
      <h3 id={headingId} className="text-base font-semibold text-content">
        Filled in for you
      </h3>
      <p className="text-sm text-content-secondary">
        These sections fill themselves from the rest of PropertyPro. Change them where they come from.
      </p>
      <ul aria-labelledby={headingId} className="divide-y divide-edge-subtle">
        {filledInRows(communityId, facts).map((row) => (
          <li
            key={row.section}
            className="grid gap-1 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
          >
            <span className="text-sm font-medium text-content">{row.section}</span>
            <span className="min-w-0 break-words text-sm text-content-secondary">{row.shows}</span>
            <Link
              href={row.href}
              className={cn('inline-flex items-center text-sm font-medium text-content-link underline', TOUCH)}
            >
              Open {row.source}
              <span className="sr-only"> to change {row.section.toLowerCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

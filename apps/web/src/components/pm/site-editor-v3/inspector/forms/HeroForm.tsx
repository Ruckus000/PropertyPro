'use client';

import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import {
  MAX_HERO_PHOTOS,
  heroBlockSchema,
  parseLinkedText,
  resolveHeroHeadline,
  resolveHeroPhotos,
  resolveLinkedText,
  type HeroPhoto,
  type LinkedFacts,
  type LinkedField,
} from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateHeroBlock } from '@/hooks/use-hero-block';
import { useBlockForm } from '../use-block-form';
import { useLinkedFacts } from '../linked-facts-context';
import { useSectionSources } from '../section-sources-context';
import { heroWordingForLayout } from '@/lib/site-looks/look-wording';
import { HeroPhotosField } from './fields/HeroPhotosField';
import { LinkedChips } from './fields/LinkedChips';
import type { BlockFormProps } from '../types';

const HEADLINE_MAX = 120;
const SUBTITLE_MAX = 280;
const CTA_TEXT_MAX = 40;
const CTA_TARGET_MAX = 512;

interface HeroDraft {
  headline: string;
  subtitle: string;
  ctaText: string;
  ctaTarget: string;
  photos: HeroPhoto[];
}

/**
 * Tolerant parse, then the read-time upgrade.
 *
 * `resolveHeroPhotos` is why a hero authored before `photos` existed opens
 * here with its image already in the list: the legacy `heroImagePath` pair
 * becomes a one-element array, and the first save writes the new shape. That
 * is the whole migration — there is no backfill.
 *
 * A stock photo (D3) has no path and is carried exactly as stored: rebuilding
 * it as an upload would write `{ path: undefined }`, which the schema refuses.
 */
function toDraft(content: unknown): HeroDraft {
  const parsed = heroBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      headline: parsed.data.headline,
      subtitle: parsed.data.subtitle ?? '',
      ctaText: parsed.data.ctaText ?? '',
      ctaTarget: parsed.data.ctaTarget ?? '',
      photos: resolveHeroPhotos(parsed.data).map((photo): HeroPhoto => {
        if ('stock' in photo) return { stock: photo.stock, alt: photo.alt };
        return photo.decorative === true
          ? { path: photo.path, decorative: true }
          : { path: photo.path, alt: photo.alt ?? '' };
      }),
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  return {
    headline: typeof loose.headline === 'string' ? loose.headline : '',
    subtitle: typeof loose.subtitle === 'string' ? loose.subtitle : '',
    ctaText: typeof loose.ctaText === 'string' ? loose.ctaText : '',
    ctaTarget: typeof loose.ctaTarget === 'string' ? loose.ctaTarget : '',
    photos: [],
  };
}

/** Whether a photo meets the schema's rule: a description, or an upload marked decorative. */
function isDescribed(photo: HeroPhoto): boolean {
  if ('stock' in photo) return photo.alt.length > 0;
  return photo.decorative === true || (photo.alt ?? '').length > 0;
}

/** The two fields a linked detail can be put into. */
type WordsField = 'headline' | 'subtitle';

/**
 * The buttons that put a linked detail into the words. The visible text is short;
 * the accessible name says what is inserted, and still contains the visible text.
 */
const INSERT_BUTTONS: ReadonlyArray<{ field: LinkedField; text: string; label: string }> = [
  { field: 'name', text: 'Name', label: 'Insert the community name' },
  { field: 'city', text: 'City', label: 'Insert the city' },
  { field: 'units', text: 'Homes', label: 'Insert the number of homes' },
];

const FIELD_NAME: Record<WordsField, string> = { headline: 'headline', subtitle: 'subtitle' };

/** What each detail is called in the line that says it was added. */
const DETAIL_PHRASE: Record<LinkedField, string> = {
  name: 'community name',
  city: 'city',
  units: 'number of homes',
};

/** What the last press of an insert button did, said aloud in a status line. */
type InsertNotice =
  | { kind: 'added'; field: WordsField; detail: LinkedField }
  | { kind: 'no-room'; field: WordsField };

/** What the "Shows as" line says when every sentence drops. */
const NOTHING_SHOWN = "nothing. It uses a detail your Community profile doesn't have yet.";

/**
 * What the page will show for these words, for the "Shows as" line, or null when
 * the line would add nothing: the community's facts are not known, or the words
 * use no linked detail and so show as typed.
 *
 * `resolve` is the page's own rule for the field, so a line that disagrees with the
 * page is not possible: `resolveHeroHeadline` for the headline (which shows the
 * community's name when it drops whole, to keep the page's heading) and
 * `resolveLinkedText` for the subtitle (which then shows nothing, and the line says
 * why). Which sentences dropped is the author's to see: the line holds what is left.
 */
function shownAs(
  text: string,
  facts: LinkedFacts | null,
  resolve: (text: string, facts: LinkedFacts) => string,
): string | null {
  if (facts === null || !parseLinkedText(text).some((part) => part.kind === 'field')) return null;
  return resolve(text, facts) || NOTHING_SHOWN;
}

/**
 * Draft -> stored shape.
 *
 * Returns null — i.e. blocks the save — while the content would fail
 * `heroBlockSchema`, so the form never autosaves something the publish gate
 * would then refuse:
 *   - headline is required;
 *   - CTA text and target are all-or-nothing (the schema's refine);
 *   - every photo needs alt text unless it is marked decorative;
 *   - at most MAX_HERO_PHOTOS photos. The photo field keeps to that itself, so this
 *     is the last guard rather than the usual one; without it a ninth photo would
 *     make the route refuse every autosave until one was taken away.
 *
 * `heroImagePath`/`heroImageAlt` are never written back. Saving migrates the
 * row to `photos`, and the schema refuses content carrying both shapes.
 */
function toCanonical(draft: HeroDraft): unknown | null {
  const headline = draft.headline.trim();
  if (headline.length === 0) return null;

  const ctaText = draft.ctaText.trim();
  const ctaTarget = draft.ctaTarget.trim();
  if ((ctaText.length === 0) !== (ctaTarget.length === 0)) return null;

  if (draft.photos.length > MAX_HERO_PHOTOS) return null;

  const photos = draft.photos.map((photo): HeroPhoto => {
    // A stock photo is described, never decorative; its description is the
    // manager's to reword, trimmed like an upload's.
    if ('stock' in photo) return { stock: photo.stock, alt: photo.alt.trim() };
    return photo.decorative === true
      ? { path: photo.path, decorative: true as const }
      : { path: photo.path, alt: (photo.alt ?? '').trim() };
  });
  if (photos.some((photo) => !isDescribed(photo))) {
    return null;
  }

  const subtitle = draft.subtitle.trim();
  return {
    headline,
    ...(subtitle.length > 0 ? { subtitle } : {}),
    ...(ctaText.length > 0 ? { ctaText, ctaTarget } : {}),
    ...(photos.length > 0 ? { photos } : {}),
  };
}

export function HeroForm({ communityId, blockOrder, content }: BlockFormProps) {
  // The hero writes through its own endpoint, not the blocks upsert: it lives
  // at slot 1, and `blocksUpsertContract` constrains blockOrder to min(2).
  const update = useUpdateHeroBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await update.mutateAsync(next as Parameters<typeof update.mutateAsync>[0]);
    },
    [update],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<HeroDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const headlineId = `hero-headline-${blockOrder}`;
  const subtitleId = `hero-subtitle-${blockOrder}`;
  const ctaTextId = `hero-cta-text-${blockOrder}`;
  const ctaTargetId = `hero-cta-target-${blockOrder}`;

  // The words are saved as typed, tokens and all, so a rename in Settings shows
  // on the site; these lines only say what the page does with them today.
  const facts = useLinkedFacts();
  const headlineShows = shownAs(draft.headline, facts, resolveHeroHeadline);
  const subtitleShows = shownAs(draft.subtitle, facts, resolveLinkedText);
  const overPhotoLimit = draft.photos.length > MAX_HERO_PHOTOS;
  const headlineShowsId = `${headlineId}-shows-as`;
  const subtitleShowsId = `${subtitleId}-shows-as`;
  const insertHintId = `hero-insert-hint-${blockOrder}`;

  // "Use the look's wording": the look the canvas draws, or none for a legacy
  // layout, which has no wording to go back to.
  const { layoutId } = useSectionSources();
  const lookWording = heroWordingForLayout(layoutId);
  const restoreLookWording = () => {
    if (lookWording === null) return;
    setDraft((prev) => ({ ...prev, headline: lookWording.headline, subtitle: lookWording.subtitle }));
  };

  // Linked-detail buttons. They insert at the cursor of the field the manager was
  // in. Reaching a button takes focus from that field (and in Safari a click does
  // not focus it at all), so the field is remembered, and a field keeps its
  // selection after it blurs. Focus going to any control that is not one of these
  // buttons forgets the field, and the detail is then added to the end of the
  // headline. Afterwards the cursor goes back into the field, behind the detail.
  const headlineRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const insertGroupRef = useRef<HTMLDivElement>(null);
  const lastFieldRef = useRef<WordsField | null>(null);
  const caretRef = useRef<{ field: WordsField; position: number } | null>(null);
  const [notice, setNotice] = useState<InsertNotice | null>(null);

  const onFieldBlur = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !insertGroupRef.current?.contains(next)) lastFieldRef.current = null;
  };

  const insertLinkedDetail = (detail: LinkedField) => {
    const token = `{{${detail}}}`;
    const remembered = lastFieldRef.current;
    const target: WordsField = remembered ?? 'headline';
    const element = target === 'headline' ? headlineRef.current : subtitleRef.current;
    const current = draft[target];
    const max = target === 'headline' ? HEADLINE_MAX : SUBTITLE_MAX;
    const start = remembered === null ? current.length : (element?.selectionStart ?? current.length);
    const end = remembered === null ? current.length : (element?.selectionEnd ?? start);
    const next = current.slice(0, start) + token + current.slice(end);

    // The field's own limit stops typing, not this; a longer value would be refused
    // by the route on every save.
    if (next.length > max) {
      setNotice({ kind: 'no-room', field: target });
      return;
    }
    setNotice({ kind: 'added', field: target, detail });
    caretRef.current = { field: target, position: start + token.length };
    setDraft((prev) => ({ ...prev, [target]: next }));
  };

  // After the new words are in the field, put the cursor behind the inserted detail.
  useEffect(() => {
    const caret = caretRef.current;
    if (caret === null) return;
    caretRef.current = null;
    const element = caret.field === 'headline' ? headlineRef.current : subtitleRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(caret.position, caret.position);
  }, [draft.headline, draft.subtitle]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headlineId}>
          Headline <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </Label>
        <Input
          id={headlineId}
          ref={headlineRef}
          value={draft.headline}
          maxLength={HEADLINE_MAX}
          required
          aria-describedby={headlineShows === null ? undefined : headlineShowsId}
          onFocus={() => {
            lastFieldRef.current = 'headline';
          }}
          onBlur={onFieldBlur}
          onChange={(event) => {
            setNotice(null);
            setDraft((prev) => ({ ...prev, headline: event.target.value }));
          }}
        />
        <LinkedChips text={draft.headline} />
        {headlineShows !== null && (
          <p id={headlineShowsId} className="break-words text-xs text-content-secondary">
            {`Shows as: ${headlineShows}`}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={subtitleId}>Subtitle</Label>
        <Textarea
          id={subtitleId}
          ref={subtitleRef}
          value={draft.subtitle}
          maxLength={SUBTITLE_MAX}
          rows={3}
          placeholder="Optional"
          aria-describedby={subtitleShows === null ? undefined : subtitleShowsId}
          onFocus={() => {
            lastFieldRef.current = 'subtitle';
          }}
          onBlur={onFieldBlur}
          onChange={(event) => {
            setNotice(null);
            setDraft((prev) => ({ ...prev, subtitle: event.target.value }));
          }}
        />
        <LinkedChips text={draft.subtitle} />
        {subtitleShows !== null && (
          <p id={subtitleShowsId} className="break-words text-xs text-content-secondary">
            {`Shows as: ${subtitleShows}`}
          </p>
        )}
      </div>

      <div
        ref={insertGroupRef}
        role="group"
        aria-label="Add a detail from your Community profile"
        aria-describedby={insertHintId}
        className="space-y-1.5"
      >
        <p id={insertHintId} className="text-xs text-content-secondary">
          Adds a detail from your Community profile where your cursor is. It updates by itself if
          the profile changes.
        </p>
        <div className="flex flex-wrap gap-2">
          {INSERT_BUTTONS.map(({ field, text, label }) => (
            <Button
              key={field}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 md:min-h-8"
              aria-label={label}
              onClick={() => insertLinkedDetail(field)}
            >
              {text}
            </Button>
          ))}
        </div>
        {notice !== null && (
          <p
            role="status"
            className={
              notice.kind === 'no-room'
                ? 'text-xs text-status-danger'
                : 'text-xs text-content-secondary'
            }
          >
            {notice.kind === 'no-room'
              ? `There isn't room left in the ${FIELD_NAME[notice.field]} for that. Shorten it and try again.`
              : `Added the ${DETAIL_PHRASE[notice.detail]} to the ${FIELD_NAME[notice.field]}.`}
          </p>
        )}
      </div>

      {lookWording !== null && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 md:min-h-8"
            onClick={restoreLookWording}
          >
            Use the look&apos;s wording
          </Button>
          <p className="text-xs text-content-secondary">
            {`Puts back the headline and subtitle ${lookWording.lookName} starts with, in place of yours.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={ctaTextId}>Button label</Label>
          <Input
            id={ctaTextId}
            value={draft.ctaText}
            maxLength={CTA_TEXT_MAX}
            onChange={(event) => setDraft((prev) => ({ ...prev, ctaText: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ctaTargetId}>Button link</Label>
          <Input
            id={ctaTargetId}
            value={draft.ctaTarget}
            maxLength={CTA_TARGET_MAX}
            placeholder="/auth/login"
            onChange={(event) => setDraft((prev) => ({ ...prev, ctaTarget: event.target.value }))}
          />
        </div>
      </div>

      <HeroPhotosField
        communityId={communityId}
        blockOrder={blockOrder}
        photos={draft.photos}
        onChange={(photos) => setDraft((prev) => ({ ...prev, photos }))}
      />

      {overPhotoLimit && (
        <p className="text-xs text-status-danger">
          {`The hero can show up to ${MAX_HERO_PHOTOS} photos. Remove one to save your changes.`}
        </p>
      )}

      {/* Too many photos has its sentence above; this one is for what else can be missing. */}
      {isIncomplete && !overPhotoLimit && (
        <p className="text-xs text-status-danger">
          Add a headline, describe every photo (or mark it decorative), and fill in both the
          button label and link — or neither — before this section can be saved.
        </p>
      )}
    </div>
  );
}

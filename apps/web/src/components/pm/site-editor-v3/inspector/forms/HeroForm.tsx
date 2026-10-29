'use client';

import { useCallback } from 'react';
import {
  MAX_HERO_PHOTOS,
  heroBlockSchema,
  parseLinkedText,
  resolveHeroHeadline,
  resolveHeroPhotos,
  resolveLinkedText,
  type HeroPhoto,
  type LinkedFacts,
} from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateHeroBlock } from '@/hooks/use-hero-block';
import { useBlockForm } from '../use-block-form';
import { useLinkedFacts } from '../linked-facts-context';
import { HeroPhotosField } from './fields/HeroPhotosField';
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

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headlineId}>
          Headline <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </Label>
        <Input
          id={headlineId}
          value={draft.headline}
          maxLength={HEADLINE_MAX}
          required
          aria-describedby={headlineShows === null ? undefined : headlineShowsId}
          onChange={(event) => setDraft((prev) => ({ ...prev, headline: event.target.value }))}
        />
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
          value={draft.subtitle}
          maxLength={SUBTITLE_MAX}
          rows={3}
          placeholder="Optional"
          aria-describedby={subtitleShows === null ? undefined : subtitleShowsId}
          onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
        />
        {subtitleShows !== null && (
          <p id={subtitleShowsId} className="break-words text-xs text-content-secondary">
            {`Shows as: ${subtitleShows}`}
          </p>
        )}
      </div>

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

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

/**
 * What a words field SHOWS: the stored words with the community's details filled
 * in, the way the page shows them.
 *
 * The stored words can hold `{{name}}`, `{{city}}` and `{{units}}` (a look's own
 * wording does), and a volunteer should see "Welcome to Harbor Pointe", never the
 * template. So a field with a detail in it shows `resolve(text)`, the page's own
 * rule for that field — `resolveHeroHeadline` for the headline, `resolveLinkedText`
 * for the subtitle — and words without one show as stored.
 *
 * The draft itself keeps the stored words. Typing in a field replaces them with
 * what the person sees plus their keystroke, so that field is saved as plain
 * text from then on; a field nobody typed in keeps its details, even when a photo
 * change saves the section.
 *
 * ponytail: a words field stores plain text from its first edit, so it stops
 * following name/city/units, and a template sentence hidden by a missing detail
 * (no city on file, say) is not kept. Trigger: a community renames, changes its
 * unit count or adds a missing city, and its welcome goes stale.
 */
function shown(
  text: string,
  facts: LinkedFacts | null,
  resolve: (text: string, facts: LinkedFacts) => string,
): string {
  if (facts === null || !parseLinkedText(text).some((part) => part.kind === 'field')) return text;
  return resolve(text, facts);
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

export interface HeroFormProps extends BlockFormProps {
  /**
   * `simple` (Simple mode): the words and the photos only. `full` (the
   * inspector) adds the button and "Use the look's wording".
   */
  variant?: 'full' | 'simple';
}

export function HeroForm({ communityId, blockOrder, content, variant = 'full' }: HeroFormProps) {
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

  const facts = useLinkedFacts();
  const overPhotoLimit = draft.photos.length > MAX_HERO_PHOTOS;
  const full = variant === 'full';

  // "Use the look's wording": the look the canvas draws, or none for a legacy
  // layout, which has no wording to go back to.
  const { layoutId } = useSectionSources();
  const lookWording = heroWordingForLayout(layoutId);
  const restoreLookWording = () => {
    if (lookWording === null) return;
    setDraft((prev) => ({ ...prev, headline: lookWording.headline, subtitle: lookWording.subtitle }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headlineId}>
          Headline <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </Label>
        <Input
          id={headlineId}
          value={shown(draft.headline, facts, resolveHeroHeadline)}
          maxLength={HEADLINE_MAX}
          required
          onChange={(event) => setDraft((prev) => ({ ...prev, headline: event.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={subtitleId}>Subtitle</Label>
        <Textarea
          id={subtitleId}
          value={shown(draft.subtitle, facts, resolveLinkedText)}
          maxLength={SUBTITLE_MAX}
          rows={3}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
        />
      </div>

      {full && lookWording !== null && (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={restoreLookWording}
          >
            Use the look&apos;s wording
          </Button>
          <p className="text-xs text-content-secondary">
            {`Puts back the headline and subtitle ${lookWording.lookName} starts with, in place of yours.`}
          </p>
        </div>
      )}

      {full && (
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
      )}

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
          {full
            ? 'Add a headline, describe every photo (or mark it decorative), and fill in both the button label and link — or neither — before this section can be saved.'
            : 'Add a headline and describe every photo (or mark it decorative) before this can be saved.'}
        </p>
      )}
    </div>
  );
}

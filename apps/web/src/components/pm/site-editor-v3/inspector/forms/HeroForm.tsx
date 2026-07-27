'use client';

import { useCallback } from 'react';
import { heroBlockSchema, resolveHeroPhotos, type HeroPhoto } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateHeroBlock } from '@/hooks/use-hero-block';
import { useBlockForm } from '../use-block-form';
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
 */
function toDraft(content: unknown): HeroDraft {
  const parsed = heroBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      headline: parsed.data.headline,
      subtitle: parsed.data.subtitle ?? '',
      ctaText: parsed.data.ctaText ?? '',
      ctaTarget: parsed.data.ctaTarget ?? '',
      photos: resolveHeroPhotos(parsed.data).map((photo) =>
        photo.decorative === true
          ? { path: photo.path, decorative: true }
          : { path: photo.path, alt: photo.alt ?? '' },
      ),
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

/**
 * Draft -> stored shape.
 *
 * Returns null — i.e. blocks the save — while the content would fail
 * `heroBlockSchema`, so the form never autosaves something the publish gate
 * would then refuse:
 *   - headline is required;
 *   - CTA text and target are all-or-nothing (the schema's refine);
 *   - every photo needs alt text unless it is marked decorative.
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

  const photos = draft.photos.map((photo) =>
    photo.decorative === true
      ? { path: photo.path, decorative: true as const }
      : { path: photo.path, alt: (photo.alt ?? '').trim() },
  );
  if (photos.some((photo) => photo.decorative !== true && photo.alt.length === 0)) {
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
          onChange={(event) => setDraft((prev) => ({ ...prev, headline: event.target.value }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={subtitleId}>Subtitle</Label>
        <Textarea
          id={subtitleId}
          value={draft.subtitle}
          maxLength={SUBTITLE_MAX}
          rows={3}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
        />
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

      {isIncomplete && (
        <p className="text-xs text-status-danger">
          Add a headline, describe every photo (or mark it decorative), and fill in both the
          button label and link — or neither — before this section can be saved.
        </p>
      )}
    </div>
  );
}

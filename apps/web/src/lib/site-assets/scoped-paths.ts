/**
 * Defence-in-depth: bind a stored asset path's leading segment to the editing
 * community.
 *
 * `imagePathSchema` (`packages/shared/src/site-blocks/types.ts`) enforces only
 * the SHAPE `{digits}/{logo|hero|content}/…`. Any digits satisfy it. So a PM
 * for community 42 can PATCH an `imagePath` of `999/content/x.webp` and the
 * row persists a cross-tenant reference — the schema's own contract says that
 * leading segment IS the community id, but nothing checks it.
 *
 * The `community-site-assets` bucket is anon-readable by design, so no access
 * boundary is crossed by such a path. What breaks is everything that trusts
 * the segment: `parseSiteAssetPath`, the storage RLS policies from migration
 * 0006 (which key on `storage.foldername(name)[1]`), and any per-community
 * accounting that walks the bucket by prefix — including the assets-usage
 * reconciler, which would read a foreign object as an orphan of the wrong
 * community.
 *
 * ## Why this is a shared helper
 *
 * The hero route grew this check inline, with a comment predicting exactly how
 * it would be lost: *"a new path-bearing field is exactly how it gets lost."*
 * That is what happened. `/api/v1/pm/site/blocks` accepts `image` and `gallery`
 * blocks — a gallery carries up to 24 paths — and had no equivalent check at
 * all. One inline copy is a control; two inline copies is a control and a gap.
 *
 * The error shape is load-bearing and must not drift: the hero route's
 * existing tests assert both the outer message and the inner per-field
 * message, including the `…` (U+2026) and the 32-character truncation.
 */
import { ValidationError } from '@/lib/api/errors';

export interface ScopedPath {
  /** Dotted path to the offending field, e.g. `photos.1.path`. */
  field: string;
  value: string;
}

/**
 * Throw `ValidationError` unless every path begins with `${communityId}/`.
 *
 * Call AFTER the per-block Zod parse, so the paths handed here are already
 * shape-valid and this only has to answer the tenancy question.
 */
export function assertPathsScopedToCommunity(
  communityId: number,
  paths: readonly ScopedPath[],
): void {
  for (const { field, value } of paths) {
    if (!value.startsWith(`${communityId}/`)) {
      throw new ValidationError(`${field} must reference this community`, {
        fields: [
          {
            field,
            message: `Path must start with "${communityId}/" (got "${value.slice(0, 32)}…")`,
          },
        ],
      });
    }
  }
}

/**
 * Every asset path a block's validated content carries, as `{field, value}`.
 *
 * Deliberately keyed on `blockType` with a `default: []`, rather than
 * duck-typing whatever looks like a path. A new path-bearing block type then
 * shows up as a type that returns no paths — which the block-coverage test
 * asserts against `blockSchemaRegistry`, so adding one without extending this
 * fails CI rather than silently skipping the check.
 */
export function collectBlockAssetPaths(blockType: string, content: unknown): ScopedPath[] {
  if (content === null || typeof content !== 'object') return [];
  const record = content as Record<string, unknown>;

  switch (blockType) {
    case 'image': {
      const imagePath = record['imagePath'];
      return typeof imagePath === 'string' ? [{ field: 'imagePath', value: imagePath }] : [];
    }
    case 'gallery': {
      const images = record['images'];
      if (!Array.isArray(images)) return [];
      const paths: ScopedPath[] = [];
      images.forEach((image, index) => {
        if (image === null || typeof image !== 'object') return;
        const imagePath = (image as Record<string, unknown>)['imagePath'];
        if (typeof imagePath === 'string') {
          paths.push({ field: `images.${index}.imagePath`, value: imagePath });
        }
      });
      return paths;
    }
    case 'hero': {
      // Not reachable through the blocks route (hero is excluded from its
      // contract enum and owns /api/v1/pm/site/hero), but kept here so the
      // two routes cannot disagree about what a hero's paths are.
      const paths: ScopedPath[] = [];
      const heroImagePath = record['heroImagePath'];
      if (typeof heroImagePath === 'string') {
        paths.push({ field: 'heroImagePath', value: heroImagePath });
      }
      const photos = record['photos'];
      if (Array.isArray(photos)) {
        photos.forEach((photo, index) => {
          if (photo === null || typeof photo !== 'object') return;
          const path = (photo as Record<string, unknown>)['path'];
          if (typeof path === 'string') {
            paths.push({ field: `photos.${index}.path`, value: path });
          }
        });
      }
      return paths;
    }
    default:
      return [];
  }
}

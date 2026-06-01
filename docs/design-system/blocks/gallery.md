# Gallery Block

A Pro+ "polish" content block: a heading plus a responsive grid of images, each with required alt text (unless decorative) and an optional caption. Reuses the single-image block's storage + responsive-variant pipeline.

## Schema

Source: [`packages/shared/src/site-blocks/gallery.ts`](../../../packages/shared/src/site-blocks/gallery.ts).

| Field     | Type             | Required | Constraints                          |
|-----------|------------------|----------|--------------------------------------|
| `heading` | `string`         | —        | 1–120 chars when present             |
| `images`  | `GalleryImage[]` | ✓        | 1–**24** images                      |

Each `GalleryImage` (`strict()`, same shape as the single-image block):

| Field        | Type     | Required    | Constraints                                                              |
|--------------|----------|-------------|--------------------------------------------------------------------------|
| `imagePath`  | `string` | ✓           | `{community_id}/{kind}/{filename}` — no path traversal, no schemes, no `..` |
| `altText`    | `string` | conditional | 1–200 chars. Required unless `decorative: true`.                          |
| `decorative` | `true`   | conditional | Set for decorative-only images. Cannot coexist with `altText`.           |
| `caption`    | `string` | —           | 1–200 chars when present.                                                 |

The 24-image cap bounds page weight against the per-plan storage quota and the public-site performance budget. The per-image `refine` enforces the decorative/altText mutual exclusion.

## Renderer

[`apps/web/src/components/public-site/blocks/GalleryBlock.tsx`](../../../apps/web/src/components/public-site/blocks/GalleryBlock.tsx).

- Validates `block.content` via `galleryBlockSchema.safeParse()`. Invalid content → `console.warn` + render `null`.
- Heading rendered as `<h2>` when present.
- Responsive grid (`1 / 2 / 3` columns). Each image is a `<figure>` with a `<img>` + optional `<figcaption>`.
- `srcSet` uses the `800w` and `1600w` WebP variants written by the finalize endpoint at sibling paths (`{path}.800w.webp`, `{path}.1600w.webp`); the raw upload at `imagePath` is deleted by finalize, so the fallback `src` points at the `1600w` variant.
- `sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"` and `loading="lazy"` — gallery blocks are below-the-fold.
- Decorative images render `alt=""`; non-decorative images render the required `altText`.

## Storage & quotas

Identical pipeline to the [image block](./image.md): two-step presigned upload (`POST /api/v1/site/uploads/presign` → `POST /api/v1/site/images/finalize`), `sharp` server-side transform to `800w`/`1600w` WebP variants, per-plan byte quota enforced at presign (HTTP 413 `SITE_ASSETS_QUOTA_EXCEEDED`). Professional quota: 500 MB.

## Editor

`apps/web/src/components/pm/site-editor/GalleryBlockForm.tsx` — ships in PR #10c alongside the tier-gated write path. The "add Gallery" affordance is gated to `hasSitePolishBlocks`.

## API

| Verb  | Path                     | Body                                                                           |
|-------|--------------------------|--------------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks` | `{ communityId, blockType: 'gallery', blockOrder, content: GalleryBlockContent }` |

The upsert contract enum and the conditional `hasSitePolishBlocks` server gate are added in PR #10c; until then the write path does not accept `gallery`.

Authorization: `pm_admin`/`cam` role + `hasSiteEditor` **and** `hasSitePolishBlocks` (Pro+).

## Tier

| Tier         | Available                              |
|--------------|----------------------------------------|
| Essentials   | ✗ (upsell — requires `hasSitePolishBlocks`) |
| Professional | ✓                                      |
| PM/Enterprise| ✓                                      |

## Accessibility

- Non-decorative images MUST have alt text — the schema rejects content without it.
- Decorative images render `alt=""` — screen readers skip them.
- `loading="lazy"` improves Core Web Vitals without delaying critical content.
- Heading renders as `<h2>` — preserves the page heading hierarchy.

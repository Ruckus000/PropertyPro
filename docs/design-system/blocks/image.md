# Image Block

A single image with required alt text (unless explicitly decorative), optional caption, and responsive variants written by the finalize endpoint.

## Schema

Source: [`packages/shared/src/site-blocks/image.ts`](../../../packages/shared/src/site-blocks/image.ts).

| Field         | Type      | Required    | Constraints                                                              |
|---------------|-----------|-------------|--------------------------------------------------------------------------|
| `imagePath`   | `string`  | ✓           | `{community_id}/{kind}/{filename}` — no path traversal, no schemes, no `..` |
| `altText`     | `string`  | conditional | 1–200 chars. Required unless `decorative: true`.                          |
| `decorative`  | `true`    | conditional | Set to `true` for decorative-only images. Cannot coexist with `altText`. |
| `caption`     | `string`  | —           | 1–200 chars when present.                                                 |

`strict()` mode rejects unknown fields. The schema's `refine` enforces the decorative/altText mutual exclusion.

## Renderer

[`apps/web/src/components/public-site/blocks/ImageBlock.tsx`](../../../apps/web/src/components/public-site/blocks/ImageBlock.tsx).

- Validates `block.content` via `imageBlockSchema.safeParse()` → `console.warn` + `null` on failure.
- Renders `<figure>` containing `<img>` + optional `<figcaption>`.
- `srcSet` includes the `800w` and `1600w` WebP variants written by the finalize endpoint at sibling paths (`{path}.800w.webp`, `{path}.1600w.webp`).
- `sizes="(min-width: 1024px) 800px, 100vw"` — serves the smaller variant on mobile.
- `loading="lazy"` — image blocks are below-the-fold.
- Decorative images render `alt=""`; non-decorative images render the required `altText`.

## Upload pipeline

Three-step flow orchestrated by the `useImageUpload` hook ([`apps/web/src/hooks/use-image-upload.ts`](../../../apps/web/src/hooks/use-image-upload.ts)):

1. **Presign** — `POST /api/v1/site/uploads/presign` returns `{ uploadUrl, token, storagePath, expiresAt }`. Validates MIME (JPEG/PNG/WebP only), file size (≤ 10 MB), plan feature (`hasSiteEditor`), and per-plan storage quota.
2. **PUT** — client uploads raw bytes directly to the presigned URL. No bytes pass through the Next.js app server.
3. **Finalize** — `POST /api/v1/site/images/finalize` with `{ communityId, storagePath, altText, cropBox? }`. The server downloads via service-role admin client, applies `sharp` (optional crop + resize to 1600w + 800w WebP variants), writes variants back to sibling paths, increments the quota counter, audit-logs.

The client-side `react-image-crop` preview is informational; the server-side `sharp.extract` applies the crop authoritatively.

## Storage path convention

```
community-site-assets bucket:
  {community_id}/{kind}/{uuid}-{filename}
  {community_id}/{kind}/{uuid}-{filename}.1600w.webp
  {community_id}/{kind}/{uuid}-{filename}.800w.webp
```

`kind` ∈ `{logo, hero, content}`. Image blocks use `content` for inline content sections and `hero` for hero-block backgrounds.

## Per-plan quotas

Tracked in `communities.branding.assetsBytesUsed` (jsonb). Enforced at the presign step via `assertWithinQuota` — over-budget uploads return HTTP 413 with code `SITE_ASSETS_QUOTA_EXCEEDED`. See [spec §8.3](../../superpowers/specs/2026-05-26-property-landing-page-design.md):

| Plan          | `siteAssetsQuotaBytes` |
|---------------|------------------------|
| Essentials    | 100 MB                 |
| Professional  | 500 MB                 |
| PM/Enterprise | 2 GB                   |

Account-lifecycle cron purges all `community-site-assets/{communityId}/` objects when a community is hard-deleted; counter is implicitly zeroed by the branding row's deletion.

## Editor

[`apps/web/src/components/pm/site-editor/ImageBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/ImageBlockForm.tsx).

- File input (`image/jpeg`, `image/png`, `image/webp` only).
- `react-image-crop` overlay with 16:9 aspect ratio guidance.
- Decorative checkbox toggles the alt-text input.
- Save gated on having a file (or pre-existing initial.imagePath) AND either decorative OR a non-empty altText.

## API

| Verb  | Path                                  | Auth                                       |
|-------|---------------------------------------|--------------------------------------------|
| POST  | `/api/v1/site/uploads/presign`        | pm_admin + `hasSiteEditor` + quota check   |
| POST  | `/api/v1/site/images/finalize`        | pm_admin + `hasSiteEditor`                 |
| PATCH | `/api/v1/pm/site/blocks`              | pm_admin + `hasSiteEditor` (Zod-validated) |

Rate limited at 20 req / 5 min via the `site-uploads` route category.

## Tier

| Tier         | Available                    |
|--------------|------------------------------|
| Essentials   | ✓ (gated by `hasSiteEditor`) |
| Professional | ✓                            |
| PM/Enterprise| ✓                            |

## Accessibility

- Non-decorative images MUST have alt text. The schema rejects content without it; the editor's Save button is disabled until it's filled.
- Decorative images render `alt=""` — screen readers skip them.
- `loading="lazy"` on the `<img>` improves Core Web Vitals without delaying critical content.

## Security

- MIME allowlist (JPEG/PNG/WebP) — SVG is rejected (XSS vector), GIF rejected (perceptual problem on hero blocks), HEIC rejected (sharp incompatibility).
- `imagePath` regex on the schema rejects path-traversal sequences and absolute schemes.
- Server-side `sharp` re-encodes images — strips EXIF metadata that could carry geolocation or device info.
- Crop coordinates validated against source dimensions before `sharp.extract` to prevent out-of-bounds operations.

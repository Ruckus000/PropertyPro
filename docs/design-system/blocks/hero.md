# Hero Block

The first block on every public community site. Carries the strongest visual weight.

## Schema

Source of truth: [`packages/shared/src/site-blocks/hero.ts`](../../../packages/shared/src/site-blocks/hero.ts).

| Field            | Type      | Required    | Constraints                                                                |
|------------------|-----------|-------------|----------------------------------------------------------------------------|
| `headline`       | `string`  | ✓           | 1–120 chars                                                                |
| `subtitle`       | `string`  | —           | 1–280 chars when present                                                   |
| `ctaText`        | `string`  | conditional | 1–40 chars. Must accompany `ctaTarget` (both or neither).                  |
| `ctaTarget`      | `string`  | conditional | Internal path (starts with `/`, not `//`) **or** `https://…` URL. Max 512. |
| `heroImagePath`  | `string`  | —           | Supabase Storage path. Required to accompany `heroImageAlt`.               |
| `heroImageAlt`   | `string`  | conditional | Required when `heroImagePath` is set. 1–200 chars.                         |

The schema's `strict()` mode rejects any unknown fields. The `ctaTarget` refine explicitly rejects protocol-relative URLs (`//evil.com`) to prevent open-redirect attacks — see PR #479 inline review for rationale.

## Renderer

[`apps/web/src/components/public-site/blocks/HeroBlock.tsx`](../../../apps/web/src/components/public-site/blocks/HeroBlock.tsx).

The renderer:
- Validates `block.content` via `heroBlockSchema.safeParse()`. Invalid content → render nothing + `console.warn` with `{blockId, communityId, issues}` context.
- Renders `headline` as an `<h1>`. The page-level constraint of one h1 per page is enforced by Tidewater suppressing its empty-state hero whenever a hero block is present.
- Renders subtitle as a `<p>` when present.
- Renders the CTA as an `<a>` (focus-visible-styled). Only when both `ctaText` and `ctaTarget` are present.
- Renders the hero image as a plain `<img>` (next/image upgrade lands with PR #2's storage URL pipeline). Always uses `block.content.heroImageAlt` for the `alt` attribute.

## Editor

[`apps/web/src/components/pm/site-editor/HeroBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/HeroBlockForm.tsx).

Single-tab editor at `/pm/settings/website?communityId=X`. Controlled inputs for headline, subtitle, CTA text, CTA target. Save is disabled when headline is empty or the mutation is in-flight. Empty-string fields are stripped before submission so the schema sees clean optional semantics.

Image upload UI ships with PR #2.

## API

| Verb  | Path                          | Body / Query                                            | Auth                                           |
|-------|-------------------------------|---------------------------------------------------------|------------------------------------------------|
| GET   | `/api/v1/pm/site/hero`        | `?communityId=X`                                        | pm_admin role + `hasSiteEditor` plan feature   |
| PATCH | `/api/v1/pm/site/hero`        | `{ communityId, headline, subtitle?, ctaText?, ctaTarget? }` | pm_admin role + `hasSiteEditor` plan feature   |

PR #1b writes directly to the published row. The full draft/preview/publish workflow ships in PR #8.

## Tier

| Tier         | Available                    |
|--------------|------------------------------|
| Essentials   | ✓ (gated by `hasSiteEditor`) |
| Professional | ✓                            |
| PM/Enterprise| ✓                            |

## Accessibility

- `headline` MUST be the page's `<h1>`. Tidewater enforces this by suppressing its empty-state hero when the block is present.
- `heroImageAlt` is required for any non-decorative hero image. The schema cannot be saved without it.
- The CTA `<a>` element MUST keep `:focus-visible` styling (token-driven; never suppressed).
- Heading + body color contrast is verified at the layout level against the `bay-light` (Tidewater default) preset.

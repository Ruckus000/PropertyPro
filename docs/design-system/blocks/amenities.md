# Amenities Block

A Pro+ "polish" content block: a heading plus a grid of community amenities, each with a name and an optional one-line description. PM-authored marketing content — **not** the operational amenity-reservation system (`hasAmenities`). Plain text only.

## Schema

Source: [`packages/shared/src/site-blocks/amenities.ts`](../../../packages/shared/src/site-blocks/amenities.ts).

| Field     | Type            | Required | Constraints    |
|-----------|-----------------|----------|----------------|
| `heading` | `string`        | —        | 1–120 chars when present |
| `items`   | `AmenityItem[]` | ✓        | 1–30 items     |

Each `AmenityItem` (`strict()`):

| Field         | Type     | Required | Constraints   |
|---------------|----------|----------|---------------|
| `name`        | `string` | ✓        | 1–80 chars    |
| `description` | `string` | —        | 1–280 chars when present |

`strict()` mode — unknown fields are rejected at both the block and item level (e.g., no `icon` escape hatch).

## Renderer

[`apps/web/src/components/public-site/blocks/AmenitiesBlock.tsx`](../../../apps/web/src/components/public-site/blocks/AmenitiesBlock.tsx).

- Validates `block.content` via `amenitiesBlockSchema.safeParse()`. Invalid content → `console.warn` + render `null`.
- Heading rendered as `<h2>` when present.
- Amenities rendered as a responsive 1/2-column `<ul>` of cards. Each `<li>` shows the name and, when present, the description.
- React's default escaping handles HTML in names/descriptions.

## Editor

`apps/web/src/components/pm/site-editor/AmenitiesBlockForm.tsx` — ships in PR #10c alongside the tier-gated write path. The "add Amenities" affordance is gated to `hasSitePolishBlocks`.

## API

| Verb  | Path                     | Body                                                                              |
|-------|--------------------------|-----------------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks` | `{ communityId, blockType: 'amenities', blockOrder, content: AmenitiesBlockContent }` |

`blockOrder` must be in `[2, 99]` — order 1 is reserved for the Hero block. The upsert contract enum and the conditional `hasSitePolishBlocks` server gate are added in PR #10c; until then the write path does not accept `amenities`.

Authorization: `pm_admin`/`cam` role + `hasSiteEditor` **and** `hasSitePolishBlocks` (Pro+).

## Tier

| Tier         | Available                              |
|--------------|----------------------------------------|
| Essentials   | ✗ (upsell — requires `hasSitePolishBlocks`) |
| Professional | ✓                                      |
| PM/Enterprise| ✓                                      |

## Accessibility

- Heading renders as `<h2>` — preserves the page heading hierarchy beneath the hero's `<h1>`.
- Amenities are a semantic `<ul>`/`<li>` list.
- Plain text only — no XSS surface. 16px minimum body text per the design-system rules.

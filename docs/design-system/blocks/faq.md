# FAQ Block

A Pro+ "polish" content block: a heading plus a list of collapsible question/answer pairs. Plain text only, sanitization-free by construction (no HTML, no markdown).

## Schema

Source: [`packages/shared/src/site-blocks/faq.ts`](../../../packages/shared/src/site-blocks/faq.ts).

| Field     | Type                | Required | Constraints                                  |
|-----------|---------------------|----------|----------------------------------------------|
| `heading` | `string`            | —        | 1–120 chars when present                     |
| `items`   | `FaqItem[]`         | ✓        | 1–30 items                                   |

Each `FaqItem` (`strict()`):

| Field      | Type     | Required | Constraints   |
|------------|----------|----------|---------------|
| `question` | `string` | ✓        | 1–200 chars   |
| `answer`   | `string` | ✓        | 1–2000 chars. Double-newlines split into separate `<p>`. |

`strict()` mode — unknown fields are rejected at both the block and item level.

## Renderer

[`apps/web/src/components/public-site/blocks/FaqBlock.tsx`](../../../apps/web/src/components/public-site/blocks/FaqBlock.tsx).

- Validates `block.content` via `faqBlockSchema.safeParse()`. Invalid content → `console.warn` + render `null` (defense-in-depth; the layout filters first).
- Heading rendered as `<h2>` when present.
- Each item is a native `<details>`/`<summary>` disclosure — collapsible without a client island. The question is the `<summary>`; the answer body splits on `\n{2,}` into `<p>` elements.
- React's default escaping handles HTML in answers (the test asserts `<script>` is not executed).

## Editor

`apps/web/src/components/pm/site-editor/FaqBlockForm.tsx` — ships in PR #10c alongside the tier-gated write path. The "add FAQ" affordance is gated to `hasSitePolishBlocks`.

## API

| Verb  | Path                     | Body                                                                       |
|-------|--------------------------|----------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks` | `{ communityId, blockType: 'faq', blockOrder, content: FaqBlockContent }`   |

`blockOrder` must be in `[2, 99]` — order 1 is reserved for the Hero block. The upsert contract enum and the conditional `hasSitePolishBlocks` server gate are added in PR #10c; until then the write path does not accept `faq`.

Authorization: `pm_admin`/`cam` role + `hasSiteEditor` **and** `hasSitePolishBlocks` (Pro+).

## Tier

| Tier         | Available                              |
|--------------|----------------------------------------|
| Essentials   | ✗ (upsell — requires `hasSitePolishBlocks`) |
| Professional | ✓                                      |
| PM/Enterprise| ✓                                      |

## Accessibility

- `<details>`/`<summary>` is keyboard-operable and exposes expanded/collapsed state natively (satisfies the collapsible-section rule without manual `aria-expanded`).
- Heading renders as `<h2>` — preserves the page heading hierarchy beneath the hero's `<h1>`.
- Plain text only — no XSS surface. 16px minimum body text per the design-system rules.

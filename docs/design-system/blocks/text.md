# Text Block

A plain-text content block with an optional heading. Sanitization-free by construction (no HTML, no markdown).

## Schema

Source: [`packages/shared/src/site-blocks/text.ts`](../../../packages/shared/src/site-blocks/text.ts).

| Field     | Type     | Required | Constraints                                              |
|-----------|----------|----------|----------------------------------------------------------|
| `heading` | `string` | —        | 1–120 chars when present                                 |
| `body`    | `string` | ✓        | 1–2000 chars. Double-newlines split into separate `<p>`. |

`strict()` mode — unknown fields are rejected (no `htmlBody`, no escape hatches).

## Renderer

[`apps/web/src/components/public-site/blocks/TextBlock.tsx`](../../../apps/web/src/components/public-site/blocks/TextBlock.tsx).

- Validates `block.content` via `textBlockSchema.safeParse()`. Invalid content → `console.warn` + render `null` (defense-in-depth; Tidewater filters first).
- Heading rendered as `<h2>` when present.
- Body rendered as one or more `<p>` elements — splits on `\n{2,}`.
- React's default escaping handles HTML in the body (the test asserts `<script>` is not executed).

## Editor

[`apps/web/src/components/pm/site-editor/TextBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/TextBlockForm.tsx).

Two fields: heading (optional, 120 max) and body (required, 2000 max). Save is disabled while body is empty or the mutation is in flight. Empty-string fields are stripped before submission so the schema sees clean optional-field semantics. Server validation errors surface inline via `role=alert`.

## API

| Verb  | Path                          | Body                                                                          |
|-------|-------------------------------|-------------------------------------------------------------------------------|
| GET   | `/api/v1/pm/site/blocks`      | Query: `?communityId=X` → `{ data: { blocks: SiteBlock[] } }`                 |
| PATCH | `/api/v1/pm/site/blocks`      | `{ communityId, blockType: 'text', blockOrder, content: TextBlockContent }`   |

`blockOrder` must be in `[2, 99]` — order 1 is reserved for the Hero block.

Authorization: `pm_admin` role + `hasSiteEditor` plan feature (Essentials+).

## Tier

| Tier         | Available                    |
|--------------|------------------------------|
| Essentials   | ✓ (gated by `hasSiteEditor`) |
| Professional | ✓                            |
| PM/Enterprise| ✓                            |

## Accessibility

- Heading renders as `<h2>` — preserves the page's heading hierarchy beneath the hero's `<h1>`.
- Plain text only — no XSS surface.
- 16px minimum body text per the design-system rules.

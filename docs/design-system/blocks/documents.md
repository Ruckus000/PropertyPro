# Documents Block

System-of-Record (SoR) block — the renderer reads from the `documents` + `document_categories` tables at render time. PM configures which document categories appear on the public site.

## Schema

Source: [`packages/shared/src/site-blocks/documents.ts`](../../../packages/shared/src/site-blocks/documents.ts).

| Field               | Type        | Required | Default | Constraints                                              |
|---------------------|-------------|----------|---------|----------------------------------------------------------|
| `limit`             | `number`    | ✓        | 5       | Integer 1–20.                                            |
| `includeCategories` | `string[]`  | —        | —       | Subset of `['budget','minutes','financial','rules','other']`. |

`strict()` rejects unknown fields. If `includeCategories` is empty or omitted, the renderer returns NO documents (safe default — the block hides itself).

## Renderer

[`apps/web/src/components/public-site/blocks/DocumentsBlock.tsx`](../../../apps/web/src/components/public-site/blocks/DocumentsBlock.tsx).

Async server component:
1. Validates config via `documentsBlockSchema.safeParse()`. Invalid → `console.warn` + `null`.
2. Calls `getPublicCommunityScopedReader(community.id).listDocuments({ limit, includeCategories })`.
3. Filters at the reader level: `community_id`, `deleted_at IS NULL`, `documentCategories.name IN (...)`. Ordered by `created_at DESC`.
4. Renders title + optional description + a download link.

## Public-access guarantee

PR #4 has NO `public_access` boolean on `documents`. The only public-access control is the PM's category selection in the editor. PMs MUST take care: any document filed under a category they include in the block is publicly visible.

A follow-up PR will add a per-document `public_access` boolean + UI control. Until then, PMs should treat the category filter as the boundary — typical statutory categories (`budget`, `minutes`, `financial`, `rules`) are appropriate for public exposure; `other` is risky.

## Download links

The block links to the existing authenticated `/api/v1/documents/[id]/download` route. Unauthenticated visitors will be redirected to login. A follow-up PR will replace this with an unauthenticated presigned-download URL once the `public_access` boolean lands.

## Editor

[`apps/web/src/components/pm/site-editor/DocumentsBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/DocumentsBlockForm.tsx).

- Limit number input (1–20, default 5).
- Five checkboxes — one per category (budget, minutes, financial, rules, other).
- Save disabled when limit is out of range.

## API

| Verb  | Path                          | Body                                                                                  |
|-------|-------------------------------|---------------------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks`      | `{ communityId, blockType: 'documents', blockOrder, content: DocumentsBlockContent }` |

Authorization: `pm_admin` + `hasSiteEditor`.

## Tier

Available on Essentials+ (`hasSiteEditor`).

## Accessibility

- Section labelled by `<h2>Documents</h2>` with `id`-targeted `aria-labelledby`.
- Each document is a card with semantic `<h3>` title and a focus-visible download link.
- Category names render as text labels, not color-only signals.

## Security

- Audience boundary lives entirely in the category filter for v1.
- `community_id` filter at the reader prevents cross-tenant leakage.
- Download links route through the authenticated download API — unauthorized visitors cannot reach the file bytes without logging in.

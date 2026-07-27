# Payments Block

A single prominent "pay your assessment" panel. Added in website-editor-v3 Phase 9 (gap-analysis row 23).

**It renders a link, and nothing else.** No card or bank details are collected, stored or forwarded by this block, whichever target is in play — the payment happens on the page it opens. That is what keeps v3's "no card details touch your website" copy literally true, and the block itself repeats that promise to residents.

## Schema

Source: [`packages/shared/src/site-blocks/payments.ts`](../../../packages/shared/src/site-blocks/payments.ts).

| Field       | Type     | Required | Constraints                              |
|-------------|----------|----------|------------------------------------------|
| `heading`   | `string` | —        | 1–120 chars when present                 |
| `body`      | `string` | —        | 1–600 chars when present                 |
| `ctaText`   | `string` | —        | 1–40 chars when present                  |
| `ctaTarget` | `string` | —        | `ctaTargetSchema` — internal path or `https://` URL, ≤512 chars |

`strict()` mode — unknown fields are rejected (mass assignment).

Every field is optional; the renderer supplies defaults, so an empty `{}` is valid and renders a usable panel.

### `ctaTarget` and the portal default

Absent means "this community's own resident portal", resolved **at render time** via `buildCommunityUrl(slug, '/payments')`. The resolved URL is deliberately *not* stored: doing so would bake in the community's current slug and silently break every payments block after a rename.

Most Florida associations collect through a third party — ClickPay, Zego and PayLease between them cover the majority — so a portal-only link would make the block unusable for them. A PM may supply an override, validated by the **existing** `ctaTargetSchema` (`packages/shared/src/site-blocks/types.ts`) rather than a second URL validator. That schema normalises backslashes and rejects anything resolving protocol-relative, so all of these are refused:

`//evil.com` · `/\evil.com` · `\\evil.com` · `/\/\evil.com` · `javascript:…` · `data:…` · bare `http://`

## Renderer

[`apps/web/src/components/public-site/blocks/PaymentsBlock.tsx`](../../../apps/web/src/components/public-site/blocks/PaymentsBlock.tsx).

- Validates `block.content` via `paymentsBlockSchema.safeParse()`. Invalid content → `console.warn` + render `null`, so an open-redirect payload cannot reach the DOM even if it somehow reached storage.
- Heading renders as `<h2>`; the section is `aria-labelledby` it.
- **External targets** (including the portal default, which is a sibling subdomain) get `target="_blank"` and `rel="noopener noreferrer"` — `noopener` blocks reverse-tabnabbing via `window.opener`, `noreferrer` stops leaking the community's URL to the processor. A visually-hidden "(opens in a new tab)" is appended to the accessible name.
- **Internal paths** get neither: `noreferrer` on a same-site link needlessly strips the referrer, and `target="_blank"` on an in-app path is the worse experience.
- Code-split in `view-registry` — the type is new, so almost no community has one on the page yet.

## Editor

[`apps/web/src/components/pm/site-editor-v3/inspector/forms/PaymentsForm.tsx`](../../../apps/web/src/components/pm/site-editor-v3/inspector/forms/PaymentsForm.tsx).

Validation runs through `paymentsBlockSchema` itself rather than a local URL test, so the form and the server agree by construction and there is no second validator to drift.

## API

| Verb  | Path                     | Body                                                                            |
|-------|--------------------------|---------------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks` | `{ communityId, blockType: 'payments', blockOrder, content: PaymentsBlockContent }` |

`blockOrder` must be in `[2, 99]` — order 1 is reserved for the Hero block.

## Migration

The block-type list is a **CHECK constraint, not an enum**. [`0044_site_blocks_payments_type.sql`](../../../packages/db/migrations/0044_site_blocks_payments_type.sql) widens `site_blocks_block_type_check` to admit `payments`. Widening a CHECK is non-destructive and expand-style — it must be applied *before* the writing code ships, or the first save 500s.

The list is duplicated without a compile-time link across the CHECK constraint, `BLOCK_TYPES`, and the upsert contract's `z.enum`. `site-blocks-block-type-check.integration.test.ts` compares the constraint against `BLOCK_TYPES` directly, since nothing in the unit suite can catch the constraint half being missed.

## Tier

| Tier          | Available |
|---------------|-----------|
| Essentials    | ✓         |
| Professional  | ✓         |
| PM/Enterprise | ✓         |

Not a Pro-only polish block: paying assessments is core to every association regardless of plan.

## Accessibility

- Heading renders as `<h2>`, preserving the hierarchy beneath the hero's `<h1>`.
- The new-tab warning is in the link's accessible name, not conveyed by an icon alone.
- Plain text only — no XSS surface. 16px minimum body text per the design-system rules.

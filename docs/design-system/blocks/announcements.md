# Announcements Block

System-of-Record (SoR) block — the renderer reads from the `announcements` table at render time. PM authors only configure how many items appear and the time window; the announcement content itself comes from the existing announcements feature.

## Schema

Source: [`packages/shared/src/site-blocks/announcements.ts`](../../../packages/shared/src/site-blocks/announcements.ts).

| Field            | Type     | Required | Default | Constraints                                              |
|------------------|----------|----------|---------|----------------------------------------------------------|
| `limit`          | `number` | ✓        | 5       | Integer 1–20.                                            |
| `timeWindowDays` | `number` | ✓        | 30      | Integer 1–365. Only announcements published within this window appear. |

`strict()` mode — unknown fields rejected. This is a config block — no body content; the renderer reads live announcements from the DB.

## Renderer

[`apps/web/src/components/public-site/blocks/AnnouncementsBlock.tsx`](../../../apps/web/src/components/public-site/blocks/AnnouncementsBlock.tsx).

Async server component:
1. Validates `block.content` via `announcementsBlockSchema.safeParse()`. Invalid → `console.warn` + `null`.
2. Calls `getPublicCommunityScopedReader(community.id).listAnnouncements({ limit, timeWindowDays })`.
3. Reads ordered by `isPinned DESC, publishedAt DESC` — pinned items appear first.
4. Renders a `<section>` with the community-typography `<h2>Announcements</h2>` heading.
5. Empty state: card with "No announcements yet."
6. Otherwise, `<ul>` of cards. Each card has title (with optional Pinned label), publish date `<time>`, and the announcement body rendered via `dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.body) }}`.

## Public-site query semantics

The real `listAnnouncements` in [`public-community-reader.ts`](../../../apps/web/src/lib/db/public-community-reader.ts) applies these predicates:

| Predicate                       | Why                                       |
|---------------------------------|-------------------------------------------|
| `community_id = X`              | Tenant isolation                          |
| `audience = 'all'`              | Hide owner_only / board_only / tenants_only |
| `archived_at IS NULL`           | Honor PM archive action                   |
| `deleted_at IS NULL`            | Honor soft-delete                         |
| `published_at <= now()`         | Honor scheduled-future publish dates      |
| `published_at >= cutoff`        | Apply the `timeWindowDays` cutoff (optional) |
| `ORDER BY is_pinned DESC, published_at DESC` | Pinned first, then newest         |
| `LIMIT N`                       | Cap per schema                            |

Body is stored as HTML and SANITIZED at render time. The PM's announcement-authoring UI (out of scope for this PR) is the source of the body.

## Editor

[`apps/web/src/components/pm/site-editor/AnnouncementsBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/AnnouncementsBlockForm.tsx).

Two number inputs — limit and time-window. Save disabled when either is out of range. There's no announcement-authoring here — those live in the existing announcements feature. This form only configures the block.

## API

| Verb  | Path                          | Body                                                                                       |
|-------|-------------------------------|--------------------------------------------------------------------------------------------|
| GET   | `/api/v1/pm/site/blocks`      | Query: `?communityId=X` → `{ data: { blocks: SiteBlock[] } }`                              |
| PATCH | `/api/v1/pm/site/blocks`      | `{ communityId, blockType: 'announcements', blockOrder, content: AnnouncementsBlockContent }` |

`blockOrder` must be in `[2, 99]`.

Authorization: `pm_admin` role + `hasSiteEditor` plan feature (Essentials+).

## Tier

| Tier         | Available                    |
|--------------|------------------------------|
| Essentials   | ✓ (gated by `hasSiteEditor`) |
| Professional | ✓                            |
| PM/Enterprise| ✓                            |

## Accessibility

- Section labelled by an `id`-targeted `<h2>` — supports `aria-labelledby` semantics.
- Each item's `<time>` element carries a machine-readable `datetime` attribute (`item.publishedAt.toISOString()`).
- Pinned indicator is a text label, not color-only, satisfying the design-system rule against color-only signaling.

## Security

- Announcement bodies are HTML — sanitized via the existing `sanitizeHtml` helper (same one used by the legacy JSX template path) before `dangerouslySetInnerHTML`.
- The audience filter (`audience = 'all'`) at the reader level prevents board-only / owners-only announcements from leaking to the unauthenticated public site.

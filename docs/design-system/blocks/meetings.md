# Meetings Block

System-of-Record (SoR) block — the renderer reads from the `meetings` table at render time. Shows upcoming meetings within a configurable time window.

## Schema

Source: [`packages/shared/src/site-blocks/meetings.ts`](../../../packages/shared/src/site-blocks/meetings.ts).

| Field            | Type     | Required | Default | Constraints                |
|------------------|----------|----------|---------|----------------------------|
| `limit`          | `number` | ✓        | 10      | Integer 1–20.              |
| `timeWindowDays` | `number` | ✓        | 30      | Integer 1–365.             |

`strict()` rejects unknown fields. Config-only.

## Renderer

[`apps/web/src/components/public-site/blocks/MeetingsBlock.tsx`](../../../apps/web/src/components/public-site/blocks/MeetingsBlock.tsx).

Async server component:
1. Validates via `meetingsBlockSchema.safeParse()`.
2. Calls `listMeetings({ limit, timeWindowDays })`.
3. Filters at the reader level: `community_id`, `deleted_at IS NULL`, `starts_at >= now()` (upcoming only), `starts_at <= now() + windowDays`. Ordered by `starts_at ASC`.
4. Renders title + meetingType tag + formatted start time (in `community.timezone`) + location.

## Public exposure

ALL non-deleted upcoming meetings are public — this is statutory transparency. Florida §718.111(12)(g) and §720.303 require meeting notices to be publicly accessible. There is no audience filter on meetings (unlike announcements which gate on `audience='all'`).

## Editor

[`apps/web/src/components/pm/site-editor/MeetingsBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/MeetingsBlockForm.tsx).

Mirror of AnnouncementsBlockForm: limit + timeWindowDays number inputs.

## API

| Verb  | Path                          | Body                                                                                |
|-------|-------------------------------|-------------------------------------------------------------------------------------|
| PATCH | `/api/v1/pm/site/blocks`      | `{ communityId, blockType: 'meetings', blockOrder, content: MeetingsBlockContent }` |

Authorization: `pm_admin` + `hasSiteEditor`.

## Tier

Available on Essentials+ (`hasSiteEditor`).

## Accessibility

- Section labelled by `<h2>Upcoming meetings</h2>`.
- Each meeting renders `<time datetime>` with the UTC ISO timestamp; the display text is localized to `community.timezone` via `toLocaleString`.
- `meetingType` renders as a tag (uppercase letterspacing), not color-only.

## Security

- No audience filter — meetings are statutorily public.
- `community_id` predicate at the reader prevents cross-tenant leakage.
- Location field renders as plain text (no HTML); React's default escaping handles user input.

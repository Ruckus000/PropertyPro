/**
 * Route contract for `/api/v1/pm/site/look` (website builder, Phase 2B).
 *
 * PATCH is the manager's decision about the site's look, in one of two forms:
 *
 *   - `{ communityId, lookId }` drafts that look (`draftLookSwitch`, D9): the
 *     home page's sections and the look's layout, colour set, colours and fonts
 *     are saved as a draft, and nothing goes live until Publish. It answers with
 *     what the switch did to each section.
 *   - `{ communityId, keepCurrent: true }` keeps the look the site has (D18). It
 *     marks the website setup complete, which retires the dashboard card, and
 *     the "Customize your portal" checklist item. The completion moment is
 *     stamped once, so keeping again changes nothing. It answers `{ ok: true }`.
 *
 * The body is a strict union, so a request is exactly one of the two: both
 * keys, neither, `keepCurrent: false` and any other key are 400s. `lookId` is
 * checked against the four looks here, not against the layouts the public site
 * can draw: a legacy layout (tidewater, boulevard, sable) is not a look.
 *
 * POST is the look picker's **Publish this look** (D9): one click drafts the
 * look (the same switch as PATCH, which changes nothing when the card already
 * drafted it), publishes the site, and marks the website setup and the
 * "Customize your portal" checklist item complete. It never emails anyone.
 * `expectedPublishedAt` is the publish route's concurrency token: a site
 * published elsewhere since the page loaded is a 409 and nothing goes live.
 * It answers with when the site was published, or `publishedAt: null` when
 * there was nothing to publish (the live look, with no other change pending).
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { LOOK_IDS } from '@/lib/site-looks/looks';

const communityId = z.number().int().positive();

const siteLookPatchBody = z.union([
  z.object({ communityId, lookId: z.enum(LOOK_IDS) }).strict(),
  z.object({ communityId, keepCurrent: z.literal(true) }).strict(),
]);

/** What a switch did to the home page's sections (`LookSwitchCounts`). */
const lookSwitchCountsSchema = z.object({
  replaced: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});

export const siteLookPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/look',
  request: { body: siteLookPatchBody },
  response: z.union([lookSwitchCountsSchema, z.object({ ok: z.literal(true) })]),
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});

const siteLookPostBody = z
  .object({
    communityId,
    lookId: z.enum(LOOK_IDS),
    /** The `latestPublishedAt` the picker loaded (ISO 8601), or null for a site never published. */
    expectedPublishedAt: z.string().datetime().nullable(),
  })
  .strict();

export const siteLookPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/look',
  request: { body: siteLookPostBody },
  response: z.object({
    /** When the site went live with the look; null when nothing needed publishing. */
    publishedAt: z.string().nullable(),
    lookId: z.enum(LOOK_IDS),
  }),
  permission: { resource: 'settings', action: 'write' },
  tenantScope: { in: 'body' },
});

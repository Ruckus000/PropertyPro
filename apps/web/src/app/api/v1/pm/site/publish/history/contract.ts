/**
 * Route contract for `GET /api/v1/pm/site/publish/history`.
 *
 * Website editor v3, Phase 6 — the publish log. One entry per successful
 * publish, newest first.
 *
 * THE RESPONSE DELIBERATELY OMITS `snapshot`. The stored payload is the full
 * block content of a past publish; the list is a log, not a content feed, and
 * shipping the payload to every history render would hand out site content the
 * association may since have taken down. The per-item schema below is the
 * enforcement point, not just documentation: `runRoute` validates each item
 * against it, and there is no `snapshot` member to populate. `restorable`
 * carries the one bit the UI actually needs from the payload's existence —
 * whether revert is offered for that entry or whether retention has cleared it
 * (see `pruneSitePublishSnapshots`).
 *
 * PAGINATION (ADR-003 / Plan B3): `paginated: true`, so `response` describes
 * ONE item and the runner emits the canonical double-wrapped envelope
 * `{ data: { data: [...], pagination } }`. `cursor` / `pageSize` are parsed in
 * the handler rather than declared here, matching `/api/v1/access-requests`:
 * an empty-string query param (`?cursor=`) must read as "missing" via `||`,
 * which a Zod `min(1)` / `positive()` in the query schema would 400 on instead.
 *
 * `permission: { resource: 'settings', action: 'read' }` — `settings` IS in
 * `RBAC_RESOURCES`; the real gate is the PM_MANAGER_ROLES role check plus
 * `hasSiteEditor` in the handler (documented placeholder pattern for PM-only
 * routes, mirrors `pm/site/domain`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const publishHistoryEntrySchema = z.object({
  id: z.number(),
  /** ISO-8601. The stamp this publish wrote across every promoted row. */
  publishedAt: z.string(),
  /** Who published. Null for rows whose actor is no longer resolvable. */
  actorUserId: z.string().nullable(),
  changeCount: z.number(),
  /** Human labels ("Updated Text", "Removed Faq") — rendered without `snapshot`. */
  changeLabels: z.array(z.string()),
  /**
   * True when the payload is still stored and one-step revert is offered.
   * False once retention has cleared it — the entry stays in the log, but
   * `POST /publish/revert` will refuse it with a 400.
   */
  restorable: z.boolean(),
});

export const publishHistoryListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/publish/history',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: publishHistoryEntrySchema,
  paginated: true,
  permission: { resource: 'settings', action: 'read' },
});

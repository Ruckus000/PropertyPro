/**
 * Route contracts for the website editor's per-user state (builder v4, Phase 3).
 *
 * GET   /api/v1/pm/site-editor/preferences?communityId=N
 * PATCH /api/v1/pm/site-editor/preferences
 *
 * What the editor remembers for the signed-in manager: the working mode the
 * first-run chooser asked for (Guided / Free edit), whether they finished the
 * tour, and their own progress on the "Make it yours" checklist steps. Every
 * value is a closed enum or a boolean — no free-form JSON is stored.
 *
 * The Florida-required checklist items are deliberately NOT here: they are
 * computed live from the site and the records, so nobody can tick one off.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const EDITOR_MODES = ['guided', 'free'] as const;
/** Steps the manager ticks by hand ("Mark as done"). */
export const MARKABLE_STEPS = ['welcome', 'photo'] as const;
/** Steps done by visiting a tool or preview. */
export const VISITABLE_STEPS = ['design', 'pages', 'phone'] as const;

export const siteEditorPreferencesSchema = z.object({
  /** `null` until the manager answers the first-run chooser. */
  mode: z.enum(EDITOR_MODES).nullable(),
  tourDone: z.boolean(),
  marked: z.array(z.enum(MARKABLE_STEPS)),
  visited: z.array(z.enum(VISITABLE_STEPS)),
});

export type SiteEditorPreferences = z.infer<typeof siteEditorPreferencesSchema>;

export const getSiteEditorPreferencesContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site-editor/preferences',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: siteEditorPreferencesSchema,
  permission: { resource: 'settings', action: 'read' },
  tenantScope: { in: 'query' },
});

export const patchSiteEditorPreferencesContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site-editor/preferences',
  request: {
    body: z
      .object({
        communityId: z.number().int().positive(),
        mode: z.enum(EDITOR_MODES).optional(),
        tourDone: z.boolean().optional(),
        mark: z.enum(MARKABLE_STEPS).optional(),
        unmark: z.enum(MARKABLE_STEPS).optional(),
        visit: z.enum(VISITABLE_STEPS).optional(),
      })
      .strict(),
  },
  response: siteEditorPreferencesSchema,
  permission: { resource: 'settings', action: 'read' },
  tenantScope: { in: 'body' },
});

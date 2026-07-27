/**
 * Route contracts for `/api/v1/pm/site/settings`. Website editor v3, Phase 8.
 *
 * Lives in its own file so the hook layer can `import type` from here without
 * dragging Next.js / service code into the client bundle — same reason as
 * `site/urgent-notice/contract.ts`.
 *
 * These schemas are the FIRST of two enforcement layers for the length caps.
 * `site-settings-service` re-checks after trimming and is authoritative. There
 * is no third layer: unlike the urgent notice (a real column, with a DB CHECK
 * from migration 0042), these values live inside the `branding` jsonb blob,
 * where a CHECK constraint has nothing to attach to.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import {
  FOOTER_ASSOCIATION_NAME_MAX_LENGTH,
  FOOTER_NOTE_MAX_LENGTH,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
} from '@/lib/site-editor/site-settings';

/**
 * A nullable, optional text field.
 *
 * The three states are distinct and all reachable: absent means "leave it
 * alone", `null` means "clear it", and a string means "set it". A plain
 * `.optional()` string could not express the middle one.
 *
 * The cap here is `MAX * 2` UTF-16 units, deliberately looser than the service's
 * code-point cap. The asymmetry is safe in exactly one direction: Zod's `.max()`
 * can only be STRICTER for astral characters, so a 60-emoji title (120 units)
 * has to survive this layer for the service to be the one that decides. Same
 * reasoning as `urgent-notice/contract.ts`.
 */
const patchText = (max: number) => z.string().max(max * 2).nullable().optional();

const siteSettingsSchema = z.object({
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  searchIndexing: z.boolean(),
  favicon: z
    .object({ icon32Path: z.string(), appleTouch180Path: z.string() })
    .nullable(),
});

const siteFooterSchema = z.object({
  associationName: z.string().nullable(),
  note: z.string().nullable(),
  showStatutoryLine: z.boolean(),
});

const siteSettingsResponse = z.object({
  settings: siteSettingsSchema,
  footer: siteFooterSchema,
});

export const siteSettingsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/settings',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: siteSettingsResponse,
  permission: { resource: 'settings', action: 'read' },
});

export const siteSettingsPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/pm/site/settings',
  request: {
    // `.strict()` rejects unknown keys outright — mass-assignment protection,
    // matching `heroBlockSchema` and every other Phase 2b+ schema. It also
    // stops a caller reaching a sibling branding key (colours, logo paths,
    // assetsBytesUsed) through this route.
    //
    // Deliberately NOT `.refine()`d to require at least one field. A refined
    // object is a ZodEffects, which the contract suite's malformed-input probe
    // classifies as permissive; `communityId` being required already makes `{}`
    // a rejection. A PATCH carrying only `communityId` is an accepted no-op.
    body: z
      .object({
        communityId: z.number().int().positive(),
        seoTitle: patchText(SEO_TITLE_MAX_LENGTH),
        seoDescription: patchText(SEO_DESCRIPTION_MAX_LENGTH),
        /**
         * Whether search engines may index this community's public pages.
         *
         * Absent leaves the current value alone. The DEFAULT, for a community
         * that has never set it, is indexable — enforced in
         * `isSearchIndexingEnabled`, not here.
         */
        searchIndexing: z.boolean().optional(),
        associationName: patchText(FOOTER_ASSOCIATION_NAME_MAX_LENGTH),
        note: patchText(FOOTER_NOTE_MAX_LENGTH),
        /**
         * The opt-in statutory records line. The PM chooses whether it appears,
         * never what it says — the wording is fixed in `STATUTORY_FOOTER_LINE`
         * because it is a compliance decision, not copy. See gap analysis §5.
         */
        showStatutoryLine: z.boolean().optional(),
      })
      .strict(),
  },
  response: siteSettingsResponse,
  permission: { resource: 'settings', action: 'write' },
});

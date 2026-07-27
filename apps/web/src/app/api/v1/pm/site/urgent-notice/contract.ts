/**
 * Route contracts for `/api/v1/pm/site/urgent-notice`. Website editor v3, Phase 7.
 *
 * Lives in its own file so the hook layer can `import type` from here without
 * dragging Next.js / service code into the client bundle — same reason as
 * `site/blocks/contract.ts`.
 *
 * These three routes drive the only write in the product that reaches the
 * public site with no draft and no review. The schemas below are the FIRST of
 * three enforcement layers for the 240-character cap; the service re-checks
 * after trimming and a DB CHECK (migration 0042) backstops both.
 */
import { defineRoute, z } from '@propertypro/api-contract';
import { URGENT_NOTICE_MAX_LENGTH } from '@/lib/site-editor/urgent-notice';

const urgentNoticeSchema = z.object({
  text: z.string(),
  /** ISO-8601, or null when the notice stays up until removed. */
  expiresAt: z.string().nullable(),
  setAt: z.string().nullable(),
});

const urgentNoticeResponse = z.object({
  /** Null when no notice is posted. May be an EXPIRED notice — see the service. */
  urgentNotice: urgentNoticeSchema.nullable(),
});

export const urgentNoticeGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/pm/site/urgent-notice',
  request: {
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: urgentNoticeResponse,
  permission: { resource: 'settings', action: 'read' },
});

export const urgentNoticeSetContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/urgent-notice',
  request: {
    // `.strict()` rejects unknown keys outright — mass-assignment protection,
    // matching `heroBlockSchema` and every other Phase 2b+ block schema.
    body: z
      .object({
        communityId: z.number().int().positive(),
        /**
         * The banner text. Trimmed and capped here, then again in the service.
         *
         * NOTE the cap is on UTF-16 length at this layer and on code points in
         * the service. That asymmetry is deliberate and safe in one direction:
         * Zod's `.max()` can only be STRICTER for astral characters, and the
         * service's code-point check is the one that decides. A 240-emoji
         * notice is 480 units, so it is the service — not this schema — that
         * has the final say on what a "character" means.
         */
        text: z.string().trim().min(1).max(URGENT_NOTICE_MAX_LENGTH * 2),
        /** ISO-8601 timestamp, or null for "until I remove it". */
        expiresAt: z.string().datetime().nullable(),
      })
      .strict(),
  },
  response: urgentNoticeResponse,
  permission: { resource: 'settings', action: 'write' },
});

export const urgentNoticeClearContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/pm/site/urgent-notice',
  request: {
    // Bodyless DELETE, so tenancy travels in the query string. The middleware
    // `x-community-id` header remains authoritative — this value is the
    // cross-checked redundant one (`resolveEffectiveCommunityId`).
    query: z.object({
      communityId: z.coerce.number().int().positive(),
    }),
  },
  response: z.object({ ok: z.literal(true) }),
  permission: { resource: 'settings', action: 'write' },
});

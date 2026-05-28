/**
 * Route contract for `POST /api/v1/pm/site/publish`. Plan A1.
 *
 * Slice 8b of the spec §2.7 atomic publish workflow. Exposes the
 * `publishCommunitySite` service (PR #8a) as a route + lets the PM editor
 * trigger an atomic community-wide publish.
 *
 * Optimistic-concurrency token (`expectedPublishedAt`):
 *   - Caller passes the `publishedAt` it loaded with the editor state
 *     (serialized as an ISO 8601 string in the body).
 *   - The service compares the value against the current max
 *     `published_at` across published, non-deleted site_blocks. A mismatch
 *     means another editor published in the meantime → 409 ConflictError.
 *   - First-ever publishes (no prior `published_at`) pass `null`.
 *
 * Response shape mirrors `PublishCommunitySiteResult` from the service —
 * a discriminated union on `published`. The runner's safeParse only
 * checks the success path, so we use a loose `z.unknown()` to avoid
 * round-trip validation issues on the Date instance.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const publishBodySchema = z.object({
  communityId: z.number().int().positive(),
  /**
   * Optimistic-concurrency token. ISO-8601 timestamp (the `publishedAt`
   * the editor loaded), or `null` for a first-ever publish. Anything
   * else is rejected at the schema layer.
   */
  expectedPublishedAt: z.string().datetime().nullable(),
});

export const publishCommunitySiteContract = defineRoute({
  method: 'POST',
  path: '/api/v1/pm/site/publish',
  request: {
    body: publishBodySchema,
  },
  /**
   * Loose response — the handler returns either
   *   { published: true,  publishedAt: Date, promotedCount: number, retiredCount: number }
   * or
   *   { published: false, reason: 'nothing-to-publish' }
   *
   * The runner runs `safeParse` against the response BEFORE Next.js
   * serializes it, so a tight `z.object({ publishedAt: z.date() })` would
   * fail on the consumer side after serialization round-trips Date → string.
   * Consumers should narrow by checking `result.published`.
   */
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});

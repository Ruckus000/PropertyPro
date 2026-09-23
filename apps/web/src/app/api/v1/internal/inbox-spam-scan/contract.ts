/**
 * Route contract for `GET /api/v1/internal/inbox-spam-scan`.
 *
 * Most `/api/v1/internal/*` jobs are on `KNOWN_UNCONTRACTED_ROUTES`, and
 * `.claude/rules/api-patterns.md` names the whole directory as a runner
 * constraint. That blanket is about token-auth integration; the runner does no
 * auth at all (`permission` below is metadata, and `requireCronSecret` runs
 * inside the handler). `verify-contracts.ts` states the real criteria — a route
 * is runner-blocked when it needs 201/202/204, a raw body, or a non-JSON
 * response. This job needs none of them: no input, one JSON object, 200. So it
 * is contracted rather than appended to an allowlist whose ceiling is pinned
 * precisely to stop that.
 *
 * `method: 'GET'` is load-bearing, not cosmetic. Vercel cron issues GET, and
 * the route also exports POST for manual invocation and the admin Health
 * board's per-row Retry. The runner reads `contract.method` only to decide
 * whether to parse a request body — declaring POST would make it try to parse
 * one on the scheduled GET, which carries none.
 *
 * `permission` is a placeholder: `RBAC_RESOURCES` has no "cron" or "platform"
 * member, this route is not gated by the RBAC matrix, and the runner does not
 * enforce the field.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const inboxSpamScanResponseSchema = z.object({
  spamCount: z.number().int().nonnegative(),
  hamCount: z.number().int().nonnegative(),
  /** Messages whose score CHANGED this run; every message is re-scored. */
  scored: z.number().int().nonnegative(),
  shelved: z.number().int().nonnegative(),
  /**
   * True while the classifier is scoring but deliberately not acting, because
   * one of the two label corpora is below the cold-start floor. This is the
   * field to watch: it is expected to stay true for a long time.
   */
  advisoryOnly: z.boolean(),
});

export const inboxSpamScanContract = defineRoute({
  method: 'GET',
  path: '/api/v1/internal/inbox-spam-scan',
  request: {},
  response: inboxSpamScanResponseSchema,
  permission: { resource: 'settings', action: 'read' },
});

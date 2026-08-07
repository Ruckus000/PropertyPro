/**
 * Public Marketing Lead Capture — POST /api/v1/public/leads
 *
 * Fed by the §718 compliance checker on the marketing site: the visitor has just
 * entered their association type and unit count and been told whether a
 * statutory website obligation applies. That is the highest-intent moment on the
 * public site, and before this route existed it captured nothing.
 * See docs/gtm/03-LAUNCH-READINESS.md item B1.
 *
 * Unauthenticated by design — mirrors the public community-search route: the
 * per-IP rate limit runs BEFORE contract validation so malformed bodies cannot
 * bypass the throttle.
 *
 * Always responds `{ ok: true }` on a well-formed submission, including when the
 * email was already known. Distinguishing "new" from "duplicate" would turn this
 * into an oracle for whether a given address is already in our pipeline.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { resolveClientIp } from '@/lib/api/client-ip';
import { RateLimitError } from '@/lib/api/errors';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { captureMarketingLead } from '@/lib/services/marketing-leads-service';
import { publicLeadsPostContract } from './contract';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const leadHandler = runRoute(publicLeadsPostContract, async ({ body }) => {
  await captureMarketingLead({
    email: body.email,
    associationName: body.associationName,
    contactName: body.contactName,
    associationType: body.associationType,
    unitCount: body.unitCount,
    obligationRequired: body.obligationRequired,
  });
  return { ok: true };
});

export const POST = withErrorHandler(async (req, ctx) => {
  const ip = resolveClientIp(req);
  const result = getRateLimiter().check(
    `marketing-lead:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!result.allowed) {
    throw new RateLimitError(
      `Too many submissions. Try again in ${result.retryAfter}s.`,
    );
  }

  return leadHandler(req, ctx);
});

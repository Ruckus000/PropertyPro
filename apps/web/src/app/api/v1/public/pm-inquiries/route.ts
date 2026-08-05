/**
 * Public PM Inquiry Capture — POST /api/v1/public/pm-inquiries
 *
 * Backs the portfolio inquiry form at `/contact`. Before this route existed the
 * property-manager tier — the most visually emphasized thing on the pricing page
 * — routed to a `mailto:` link and produced no record at all.
 * See docs/gtm/03-LAUNCH-READINESS.md item B3.
 *
 * Unauthenticated by design. Like the compliance-checker route, the per-IP rate
 * limit runs BEFORE contract validation so malformed bodies cannot bypass the
 * throttle, and the response is always `{ ok: true }` on a well-formed body —
 * including when the email is already known — so it cannot be used to probe who
 * is already in the pipeline.
 *
 * The window is wider and the count lower than the checker's: a portfolio
 * inquiry is a considered, one-off action, not something anyone legitimately
 * repeats within a minute.
 */
import { runRoute } from '@propertypro/api-contract';
import { resolveClientIp } from '@/lib/api/client-ip';
import { withErrorHandler } from '@/lib/api/error-handler';
import { RateLimitError } from '@/lib/api/errors';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { captureMarketingLead } from '@/lib/services/marketing-leads-service';
import { publicPmInquiriesPostContract } from './contract';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

const inquiryHandler = runRoute(publicPmInquiriesPostContract, async ({ body }) => {
  await captureMarketingLead({
    email: body.email,
    contactName: body.contactName,
    // A management company's name occupies the same slot as an association's:
    // both answer "who is this lead". The admin console labels the column from
    // `source`, so nothing downstream conflates them.
    associationName: body.companyName,
    communityCount: body.communityCount,
    unitCount: body.unitCount,
    message: body.message,
    source: 'pm_inquiry',
  });
  return { ok: true };
});

export const POST = withErrorHandler(async (req, ctx) => {
  const ip = resolveClientIp(req);
  const result = getRateLimiter().check(
    `pm-inquiry:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!result.allowed) {
    throw new RateLimitError(
      `Too many submissions. Try again in ${result.retryAfter}s.`,
    );
  }

  return inquiryHandler(req, ctx);
});

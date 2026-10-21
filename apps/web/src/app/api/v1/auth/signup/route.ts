/**
 * GET /api/v1/auth/signup — public web-address availability check.
 *
 * Signup itself is email-first: `/api/v1/auth/signup/start` and `/signup/details`.
 *
 * A signed-in founder is checked without their own pending row: it is the one
 * `/signup/details` will overwrite, so it must not report their own subdomain as
 * taken (#1115) — which it did on a new browser or device, where no draft
 * carries the row's `signupRequestId`. The email comes from middleware, which
 * strips any inbound copy and stamps the session's own; it can only un-hide rows
 * written under that account's address.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { USER_EMAIL_HEADER } from '@/lib/request/forwarded-headers';
import { authSignupGetContract } from './contract';

// route-gate: public — subdomain-availability check; a signed-in caller's own pending row is excluded, nothing else changes
export const GET = withErrorHandler(
  runRoute(authSignupGetContract, async ({ query, req }) =>
    checkSignupSubdomainAvailability(query.subdomain, {
      excludeSignupRequestId: query.signupRequestId,
      excludeEmailNormalized: req.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase() || undefined,
      signupRequestId: query.signupRequestId,
    }),
  ),
);

/**
 * GET /api/v1/auth/signup — public web-address availability check.
 *
 * Plan A1 drain #166. Migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 * Signup itself is email-first: `/api/v1/auth/signup/start` and `/signup/details`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { authSignupGetContract } from './contract';

// route-gate: public — sessionless subdomain-availability check; returns a boolean and a suggestion
export const GET = withErrorHandler(
  runRoute(authSignupGetContract, async ({ query }) =>
    checkSignupSubdomainAvailability(query.subdomain, {
      excludeSignupRequestId: query.signupRequestId,
      signupRequestId: query.signupRequestId,
    }),
  ),
);

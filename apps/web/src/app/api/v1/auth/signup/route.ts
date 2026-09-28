/**
 * GET + POST /api/v1/auth/signup
 *
 * Plan A1 drain #166. Migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import {
  checkSignupSubdomainAvailability,
  submitSignup,
} from '@/lib/auth/signup';
import {
  authSignupGetContract,
  authSignupPostContract,
} from './contract';

// route-gate: public — sessionless subdomain-availability check; returns a boolean and a suggestion
export const GET = withErrorHandler(
  runRoute(authSignupGetContract, async ({ query }) =>
    checkSignupSubdomainAvailability(query.subdomain, {
      excludeSignupRequestId: query.signupRequestId,
      signupRequestId: query.signupRequestId,
    }),
  ),
);

// route-gate: public — sessionless signup submit; ownership of an existing row is enforced in upsertPendingSignup (#1198)
export const POST = withErrorHandler(
  runRoute(authSignupPostContract, async ({ body }) => submitSignup(body)),
);

/**
 * POST /api/v1/auth/signup/start — email-first signup, step 1.
 *
 * Takes an email and sends a sign-in link. See `lib/auth/signup-email-first.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { startEmailFirstSignup } from '@/lib/auth/signup-email-first';
import { authSignupStartPostContract } from './contract';

// route-gate: public — sessionless; only emails a link to the submitted address, answers identically for every address, throttled per IP (auth tier) and per address
export const POST = withErrorHandler(
  runRoute(authSignupStartPostContract, async ({ body }) => startEmailFirstSignup(body)),
);

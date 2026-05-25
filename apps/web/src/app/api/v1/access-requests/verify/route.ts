/**
 * Access Request OTP Verification
 *
 * POST /api/v1/access-requests/verify — public: verify OTP submitted by applicant
 *
 * Invariants:
 * - Public route (no session required) — registered in TOKEN_AUTH_ROUTES
 * - withErrorHandler for structured errors
 * - Plan A1 drain #41 — migrated to runRoute(contract, handler). First
 *   NO-AUTH POST in the contract corpus. See ./contract.ts for the body
 *   schema, response modeling rationale, and omitted-permission convention.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { verifyOtp } from '@/lib/services/access-request-service';
import { accessRequestsVerifyContract } from './contract';

// ---------------------------------------------------------------------------
// POST — public: verify OTP for an access request
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  runRoute(accessRequestsVerifyContract, async ({ body }) => {
    return verifyOtp(body);
  }),
);

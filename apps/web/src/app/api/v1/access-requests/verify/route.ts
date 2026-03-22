/**
 * Access Request OTP Verification
 *
 * POST /api/v1/access-requests/verify — public: verify OTP submitted by applicant
 *
 * Invariants:
 * - Public route (no session required) — registered in TOKEN_AUTH_ROUTES
 * - withErrorHandler for structured errors
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { verifyOtp } from '@/lib/services/access-request-service';

const verifySchema = z.object({
  requestId: z.number().int().positive(),
  otp: z.string().length(6),
  communityId: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// POST — public: verify OTP for an access request
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed');
  }

  const result = await verifyOtp(parsed.data);
  return NextResponse.json({ data: result });
});

/**
 * Validate a `[id]` route param as a community id, with no database round-trip.
 *
 * `resolveAndVerifyCommunity` is the right helper almost everywhere: it also
 * proves the community exists and is not a demo or soft-deleted. The billing
 * routes cannot use it, for exactly that reason — a soft-deleted community that
 * still carries a live Stripe subscription is a customer still being charged, and
 * that is the case those routes exist to surface and fix. They do their own
 * primary-key lookup, with the widening reasoned at the read.
 *
 * So this is the shape check only: a positive integer, or a 400. It never proves
 * existence, and a caller that needs that must still do its own lookup — which is
 * why it returns the number rather than a "verified id" type that would imply
 * more than it checked.
 *
 * Rejecting `Number('')` (which is `0`, not `NaN`) and `'1.5'` matters:
 * `Number.isInteger` handles the second and the `<= 0` test handles the first.
 */
import { NextResponse } from 'next/server';

export function parseCommunityIdParam(rawId: string): number | NextResponse {
  const communityId = Number(rawId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }
  return communityId;
}

'use client';

/**
 * Client calls for email-first signup (ADR-003: components reach /api/v1 only
 * through hooks/). Plain async functions rather than useMutation: each is
 * called once per explicit user action, and the components own their own
 * busy/error state, so a QueryClient would add nothing.
 *
 * Both reject with `ApiRequestError`, whose `status` and `details` the trial
 * step reads (a 401/403 means the sign-in lapsed; `details.field ===
 * 'candidateSlug'` sends the user back to pick another web address).
 */
import { requestJson } from '@/lib/api/request-json';
import type { CommunityType } from '@propertypro/shared';
import type { SignupPlanId } from '@/lib/auth/signup-schema';

export function startEmailFirstSignup(email: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>('/api/v1/auth/signup/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export interface SignupDetailsBody {
  primaryContactName: string;
  communityName: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  unitCount: number;
  communityType: CommunityType;
  candidateSlug: string;
  planKey: SignupPlanId;
  termsAccepted: true;
}

export function submitSignupDetails(
  body: SignupDetailsBody,
): Promise<{ signupRequestId: string; subdomain: string }> {
  return requestJson<{ signupRequestId: string; subdomain: string }>('/api/v1/auth/signup/details', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

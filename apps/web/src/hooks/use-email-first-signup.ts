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
import {
  SIGNUP_BINDING_COOKIE,
  SIGNUP_BINDING_MAX_AGE_S,
  sha256Hex,
} from '@/lib/auth/signup-binding';
import type { CommunityType } from '@propertypro/shared';
import type { SignupPlanId } from '@/lib/auth/signup-schema';

/**
 * This browser's binding nonce: reused while the cookie lives, so a resend
 * (and every earlier link) keeps working here; created otherwise. Returns the
 * hash the server puts in the link. See lib/auth/signup-binding.ts.
 */
export async function ensureSignupBinding(): Promise<string> {
  const existing = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SIGNUP_BINDING_COOKIE}=`))
    ?.slice(SIGNUP_BINDING_COOKIE.length + 1);
  let nonce = existing && /^[0-9a-f]{64}$/.test(existing) ? existing : null;
  if (!nonce) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SIGNUP_BINDING_COOKIE}=${nonce}; Path=/; Max-Age=${SIGNUP_BINDING_MAX_AGE_S}; SameSite=Lax${secure}`;
  }
  return sha256Hex(nonce);
}

export async function startEmailFirstSignup(email: string): Promise<{ message: string }> {
  const binding = await ensureSignupBinding();
  return requestJson<{ message: string }>('/api/v1/auth/signup/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, binding }),
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
  sharedAddressAcknowledged?: boolean;
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

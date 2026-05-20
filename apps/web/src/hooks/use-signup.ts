'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Shared types (moved from signup-form.tsx during ADR-003 drain so the hook
// can express its result/input shapes without a cross-import back into the
// component).
// ---------------------------------------------------------------------------

export interface SignupApiSuccess {
  signupRequestId: string;
  subdomain: string;
  verificationRequired: true;
  checkoutEligible: false;
  message: string;
}

export type SignupField =
  | 'primaryContactName'
  | 'email'
  | 'password'
  | 'communityName'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'county'
  | 'unitCount'
  | 'candidateSlug'
  | 'termsAccepted'
  | 'planKey'
  | 'communityType';

// ---------------------------------------------------------------------------
// Documented exception to the requestJson rule:
// Each mutation here has bespoke per-operation fallback literals and a
// kind-aware error structure (network vs api) that the component renders
// verbatim. The signup mutation also carries fieldErrors on the error
// object so the component can populate inline field-error state. Raw fetch
// + custom Error subclasses preserve the pre-drain branching byte-for-byte.
// ---------------------------------------------------------------------------

export interface ConfirmVerificationResult {
  signupRequestId: string;
}

export class ConfirmVerificationError extends Error {
  kind: 'api' | 'network';
  constructor(message: string, kind: 'api' | 'network') {
    super(message);
    this.name = 'ConfirmVerificationError';
    this.kind = kind;
  }
}

export function useConfirmEmailVerification(): UseMutationResult<
  ConfirmVerificationResult,
  ConfirmVerificationError,
  string
> {
  return useMutation<ConfirmVerificationResult, ConfirmVerificationError, string>({
    mutationFn: async (signupRequestId) => {
      let response: Response;
      try {
        response = await fetch('/api/v1/auth/confirm-verification', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signupRequestId }),
        });
      } catch {
        throw new ConfirmVerificationError(
          'Unable to confirm email verification. Please try again.',
          'network',
        );
      }

      let payload: {
        data?: { success: boolean; signupRequestId: string };
        error?: { message?: string };
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new ConfirmVerificationError(
          'Unable to confirm email verification. Please try again.',
          'network',
        );
      }

      if (!response.ok || !payload.data?.success) {
        throw new ConfirmVerificationError(
          payload.error?.message ?? 'Unable to confirm email verification.',
          'api',
        );
      }

      return { signupRequestId: payload.data.signupRequestId };
    },
  });
}

// ---------------------------------------------------------------------------
// Signup creation
// ---------------------------------------------------------------------------

export interface SignupRequestBody {
  // The component's `signupRequestId` state is `string | undefined`; the
  // existing inline POST passes that through directly to JSON.stringify
  // (where `undefined` is dropped). Accept `null` too for spec compliance.
  signupRequestId: string | null | undefined;
  primaryContactName: string;
  email: string;
  password: string;
  communityName: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  unitCount: number;
  communityType: string;
  planKey: string;
  candidateSlug: string;
  termsAccepted: boolean;
}

export class SignupApiError extends Error {
  fieldErrors?: Record<string, string | undefined>;
  rawFieldErrors?: Record<string, string[] | undefined>;
  constructor(
    message: string,
    options: {
      fieldErrors?: Record<string, string | undefined>;
      rawFieldErrors?: Record<string, string[] | undefined>;
    } = {},
  ) {
    super(message);
    this.name = 'SignupApiError';
    this.fieldErrors = options.fieldErrors;
    this.rawFieldErrors = options.rawFieldErrors;
  }
}

export function useCreateSignup(): UseMutationResult<
  SignupApiSuccess,
  Error,
  SignupRequestBody
> {
  return useMutation<SignupApiSuccess, Error, SignupRequestBody>({
    mutationFn: async (requestBody) => {
      let response: Response;
      try {
        response = await fetch('/api/v1/auth/signup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
      } catch {
        throw new Error('Unable to complete signup right now.');
      }

      let payload: {
        data?: SignupApiSuccess;
        error?: {
          message?: string;
          details?: { fieldErrors?: Record<string, string[] | undefined> };
        };
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new Error('Unable to complete signup right now.');
      }

      if (!response.ok || !payload.data) {
        const rawFieldErrors = payload.error?.details?.fieldErrors;
        const normalizedFieldErrors: Record<string, string | undefined> = Object.fromEntries(
          Object.entries(rawFieldErrors ?? {}).map(([field, messages]) => [field, messages?.[0]]),
        );
        const firstFromFields =
          rawFieldErrors
          && Object.values(rawFieldErrors)
            .flat()
            .find((m): m is string => Boolean(m));
        throw new SignupApiError(
          firstFromFields ?? payload.error?.message ?? 'Unable to complete signup right now.',
          {
            fieldErrors:
              Object.keys(normalizedFieldErrors).length > 0 ? normalizedFieldErrors : undefined,
            rawFieldErrors,
          },
        );
      }

      return payload.data;
    },
  });
}

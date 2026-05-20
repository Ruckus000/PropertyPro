/**
 * Shared API-error parser for the onboarding flow hooks.
 *
 * Used by `use-apartment-onboarding.ts` and `use-condo-onboarding.ts` to
 * preserve the pre-drain wizard behavior where the route's error envelope
 * (`{ error: string | { code?: string; message?: string } }`) is parsed
 * manually and the parsed message is rendered verbatim in the wizard's
 * error banner.
 *
 * Documented exception to the requestJson rule: `requestJson` only handles
 * `error.message` and cannot accept the string form of `error`. Success
 * responses are never parsed by the onboarding wizards — only `response.ok`
 * is checked — so this helper is only invoked on non-OK paths.
 */
export interface OnboardingApiErrorResponse {
  error?: string | { code?: string; message?: string };
}

export async function readOnboardingApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as OnboardingApiErrorResponse;
    if (typeof body.error === 'string') return body.error;
    if (body.error && typeof body.error === 'object') return body.error.message ?? 'Request failed';
    return 'Request failed';
  } catch {
    return 'Request failed';
  }
}

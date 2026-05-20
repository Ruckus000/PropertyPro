/**
 * Shared API-error parser for the onboarding flow hooks.
 *
 * Used by `use-apartment-onboarding.ts` and `use-condo-onboarding.ts` to
 * parse the route's error envelope (`{ error: string | { code?: string;
 * message?: string } }`) on non-OK responses. The parsed message is
 * rendered verbatim in the wizard's error banner.
 *
 * Documented exception to the requestJson rule: `requestJson` only handles
 * `error.message` and cannot accept the string form of `error` or fall
 * back through `error.code`. Success responses are never parsed by the
 * onboarding wizards — only `response.ok` is checked — so this helper is
 * only invoked on non-OK paths.
 *
 * Robustness behavior:
 * - Checks `Content-Type` before parsing JSON. Non-JSON error responses
 *   (e.g., an HTML 500 page from an upstream proxy) return
 *   `response.statusText` (typically `'Internal Server Error'`) instead of
 *   throwing a SyntaxError that gets swallowed by the catch — gives the
 *   user a more informative literal in the wizard banner.
 * - Validates that the parsed body is a non-null object before
 *   destructuring `error` (handles `null` and array bodies that pass
 *   `response.json()` but aren't the expected shape).
 * - Falls back through `error.message → error.code → FALLBACK_ERROR` (using
 *   `||` so empty strings fall through too). `error.code` is typically a
 *   machine-readable identifier (e.g. `'AUTH_FAILED'`); intentional UX
 *   trade-off chosen as more useful than the generic fallback when no
 *   user-facing message is present.
 */
export interface OnboardingApiErrorResponse {
  error?: string | { code?: string; message?: string };
}

export async function readOnboardingApiError(response: Response): Promise<string> {
  const FALLBACK_ERROR = 'Request failed';
  try {
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return response.statusText || FALLBACK_ERROR;
    }

    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return FALLBACK_ERROR;

    const { error } = body as OnboardingApiErrorResponse;
    if (typeof error === 'string') return error || FALLBACK_ERROR;
    if (error && typeof error === 'object') {
      return error.message || error.code || FALLBACK_ERROR;
    }
    return FALLBACK_ERROR;
  } catch {
    return FALLBACK_ERROR;
  }
}

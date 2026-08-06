'use client';

import { useMutation } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/**
 * End the active support-impersonation session.
 *
 * The banner used to clear the `pp-support-session` cookie with
 * `document.cookie`. That stopped being possible when the cookie became
 * HttpOnly, and it was never the whole job anyway: the `support_sessions` row
 * stayed OPEN, so an "ended" session still counted against the admin's daily
 * limit and read as active in the audit trail.
 *
 * The route closes the row and expires the cookie in one response. Middleware
 * exempts `/api/v1/support/` from the read-only mutation block, so this POST is
 * reachable from inside a `read_only` session.
 */
export function useEndSupportSession() {
  return useMutation<{ ended: boolean }>({
    mutationFn: () =>
      requestJson<{ ended: boolean }>('/api/v1/support/end-session', {
        method: 'POST',
      }),
    // No cache to invalidate: the impersonated identity is applied in
    // middleware, so the caller does a full router refresh instead.
  });
}

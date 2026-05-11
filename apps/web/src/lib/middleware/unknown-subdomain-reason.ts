/**
 * Query value for `?reason=` on `/select-community` when middleware could not
 * resolve the hostname tenant slug to a community (see `notFoundResponse` in
 * `middleware.ts`).
 */
export const UNKNOWN_SUBDOMAIN_REASON = 'unknown-subdomain' as const;

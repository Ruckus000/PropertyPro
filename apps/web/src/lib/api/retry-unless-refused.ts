import { ApiRequestError } from '@/lib/api/request-json';

/**
 * React Query `retry` predicate: the app's usual three retries, except for a
 * refusal. A 4xx answer (a lapsed subscription, a role that may not read this,
 * a resident with no linked unit) will not change on a second asking, and
 * retrying it keeps a skeleton on screen for about seven seconds before the
 * reason appears.
 */
export function retryUnlessRefused(failureCount: number, error: Error): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 3;
}

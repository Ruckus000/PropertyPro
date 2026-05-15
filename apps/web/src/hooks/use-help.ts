'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Help widget search debounce — matches UserSearchCombobox (DEBOUNCE_MS = 300). */
const SEARCH_DEBOUNCE_MS = 300;

/** Contextual help fetch timeout — bail to fallback copy rather than spin. */
const CONTEXTUAL_TIMEOUT_MS = 1500;

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const HELP_KEYS = {
  search: (query: string, communityId: number) =>
    ['help', 'search', query, communityId] as const,
  contextual: (path: string, communityId: number) =>
    ['help', 'contextual', path, communityId] as const,
  readArticles: (communityId: number) => ['help', 'read', communityId] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HelpArticleResult {
  title: string;
  description: string;
  category: string;
  slug: string;
  readTimeMinutes?: number;
  roles?: string[];
}

export interface HelpFaqResult {
  id: number;
  question: string;
  answer: string;
}

interface HelpSearchResponse {
  articles: HelpArticleResult[];
  faqs: HelpFaqResult[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Returns `value` after it has remained unchanged for `delayMs`.
 * Suppresses fetches on every keystroke; matches the
 * UserSearchCombobox debounce pattern at apps/web/src/components/shared/.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Combines TanStack Query's stale-cancel signal with a hard timeout so a
 * slow contextual fetch falls back to "browse the help center" within
 * CONTEXTUAL_TIMEOUT_MS rather than leaving a spinner forever.
 */
function withTimeoutSignal(
  base: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!base) return timeout;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([base, timeout]);
  }
  // Fallback for runtimes without AbortSignal.any: forward both abort sources.
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  base.addEventListener('abort', onAbort, { once: true });
  timeout.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useHelpSearch(query: string, communityId: number) {
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  return useQuery<HelpSearchResponse>({
    queryKey: HELP_KEYS.search(debouncedQuery, communityId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        communityId: String(communityId),
      });
      return requestJson<HelpSearchResponse>(`/api/v1/help/search?${params}`, {
        signal,
      });
    },
    enabled: debouncedQuery.length >= 2 && communityId > 0,
    staleTime: 60_000,
  });
}

/**
 * Returns the set of article slugs the current user has viewed in this
 * community. Sourced from `help_article_views` via `/api/v1/help/views`.
 * Used by the read-state ✓ checkmark in category lists and the Start Here
 * hero. Best-effort: errors return an empty set rather than blocking UI.
 */
export function useReadArticles(communityId: number) {
  return useQuery<{ slugs: Set<string> }>({
    queryKey: HELP_KEYS.readArticles(communityId),
    queryFn: async ({ signal }) => {
      const data = await requestJson<{ slugs: string[] }>(
        `/api/v1/help/views?communityId=${communityId}`,
        { signal },
      );
      return { slugs: new Set(data.slugs) };
    },
    enabled: communityId > 0,
    staleTime: 60_000,
    retry: false,
  });
}

export function useContextualHelp(path: string, communityId: number) {
  return useQuery<HelpArticleResult[]>({
    queryKey: HELP_KEYS.contextual(path, communityId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        path,
        communityId: String(communityId),
      });
      return requestJson<HelpArticleResult[]>(
        `/api/v1/help/contextual?${params}`,
        { signal: withTimeoutSignal(signal, CONTEXTUAL_TIMEOUT_MS) },
      );
    },
    enabled: path.length > 0 && communityId > 0,
    staleTime: 300_000,
    // A timeout abort still surfaces as `error` to the consumer; the widget
    // renders its "browse the full help center" fallback in the no-data case.
    retry: false,
  });
}

export function useTrackArticleView({
  communityId,
  articleSlug,
  articleCategory,
}: {
  communityId: number;
  articleSlug: string;
  articleCategory: string;
}) {
  const lastTrackedKey = useRef<string | null>(null);

  useEffect(() => {
    const currentKey = JSON.stringify([communityId, articleSlug, articleCategory]);
    if (lastTrackedKey.current === currentKey) return;
    lastTrackedKey.current = currentKey;

    // /api/v1/help/view returns `{ ok: true }`, not the standard `{ data }`
    // envelope, so this intentionally stays on raw fetch.
    void fetch('/api/v1/help/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId, articleSlug, articleCategory }),
      keepalive: true,
    }).catch(() => {
      /* best-effort: ignore tracking failures */
    });
  }, [communityId, articleSlug, articleCategory]);
}

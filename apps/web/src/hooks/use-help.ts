'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import { requestJson } from '@/lib/api/request-json';
import type { TocItem } from '@/components/help/mdx-components';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Help widget search debounce — matches UserSearchCombobox (DEBOUNCE_MS = 300). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Contextual help fetch timeout — opt-in via useContextualHelp's
 * applyTimeout option. Used by the legacy HelpWidget drawer to short-
 * circuit a slow contextual list into a "browse the full help center"
 * fallback. NOT used by the new HelpDocsModal (a timeout there falls
 * through to the search panel even when an article IS available).
 */
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
  articleFeedback: (communityId: number, articleSlug: string) =>
    ['help', 'feedback', communityId, articleSlug] as const,
  article: (category: string, slug: string, communityId: number) =>
    ['help', 'article', category, slug, communityId] as const,
  featured: (communityId: number) => ['help', 'featured', communityId] as const,
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

export type ArticleFeedbackRating = 1 | -1;

export interface ArticleFeedbackSnapshot {
  rating: ArticleFeedbackRating;
  comment: string | null;
}

export interface SubmitArticleFeedbackInput {
  communityId: number;
  articleSlug: string;
  articleCategory: string;
  rating: ArticleFeedbackRating;
  comment: string | null;
}

interface SubmitArticleFeedbackResponse extends ArticleFeedbackSnapshot {
  id: number;
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

export interface UseContextualHelpOptions {
  enabled?: boolean;
  /**
   * Apply the CONTEXTUAL_TIMEOUT_MS abort. Legacy `<HelpWidget/>` drawer
   * uses this so it can surface a "browse the full help center" fallback
   * when the route is slow. The new `<HelpDocsModal/>` does NOT use this —
   * a timeout abort there would fall through to the search panel even
   * though a contextual article IS available, and that misses the goal
   * (Codex review: "Contextual matching fails under realistic latency").
   * Default false — opt in only where a fast-failure UX is intentional.
   */
  applyTimeout?: boolean;
}

export function useContextualHelp(
  path: string,
  communityId: number,
  enabledOrOptions: boolean | UseContextualHelpOptions = true,
) {
  const options: UseContextualHelpOptions =
    typeof enabledOrOptions === 'boolean'
      ? { enabled: enabledOrOptions }
      : enabledOrOptions;
  const enabled = options.enabled ?? true;
  const applyTimeout = options.applyTimeout ?? false;

  return useQuery<HelpArticleResult[]>({
    queryKey: HELP_KEYS.contextual(path, communityId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        path,
        communityId: String(communityId),
      });
      return requestJson<HelpArticleResult[]>(
        `/api/v1/help/contextual?${params}`,
        {
          signal: applyTimeout
            ? withTimeoutSignal(signal, CONTEXTUAL_TIMEOUT_MS)
            : signal,
        },
      );
    },
    enabled: enabled && path.length > 0 && communityId > 0,
    staleTime: 300_000,
    retry: false,
  });
}

/**
 * Returns the featured-for-role articles list from /api/v1/help/featured.
 * Used by HelpDocsModalSearchPanel when no contextual article matches
 * the current route.
 *
 * staleTime 5min — the featured list rarely changes.
 */
export function useFeaturedArticles(communityId: number) {
  return useQuery<HelpArticleResult[]>({
    queryKey: HELP_KEYS.featured(communityId),
    enabled: communityId > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<HelpArticleResult[]>(
        `/api/v1/help/featured?${params}`,
        { credentials: 'include', signal },
      );
    },
  });
}

export function useArticleFeedback({
  communityId,
  articleSlug,
}: {
  communityId: number;
  articleSlug: string;
}) {
  return useQuery<ArticleFeedbackSnapshot | null>({
    queryKey: HELP_KEYS.articleFeedback(communityId, articleSlug),
    queryFn: ({ signal }) => {
      const query = new URLSearchParams({
        communityId: String(communityId),
        articleSlug,
      });
      return requestJson<ArticleFeedbackSnapshot | null>(
        `/api/v1/help/feedback?${query.toString()}`,
        { signal },
      );
    },
    enabled: communityId > 0 && articleSlug.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSubmitArticleFeedback() {
  const queryClient = useQueryClient();

  return useMutation<SubmitArticleFeedbackResponse, Error, SubmitArticleFeedbackInput>({
    mutationFn: (input) =>
      requestJson<SubmitArticleFeedbackResponse>('/api/v1/help/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (data, input) => {
      queryClient.setQueryData<ArticleFeedbackSnapshot | null>(
        HELP_KEYS.articleFeedback(input.communityId, input.articleSlug),
        {
          rating: data.rating,
          comment: data.comment,
        },
      );
    },
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

export interface HelpArticleResponse {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
}

/**
 * Fetches a single help article (serialized MDX + TOC + metadata + related)
 * from /api/v1/help/article. Disabled when category or slug is null —
 * useful for the modal's "no contextual match" state where no article is
 * selected yet.
 *
 * Articles are effectively static at runtime, so staleTime is 5min and
 * gcTime is 1hr — minimize refetches.
 *
 * No client-side timeout. Earlier iterations layered 1500ms and then
 * 5000ms timeouts on this fetch to mask dev-mode cold-compile slowness,
 * but Codex review showed the timeout fires under real cold-start and
 * a manual fetch immediately after returns ~900ms — the user sees
 * "couldn't load this article" for an article that's actually fine.
 * Better to wait for the real response (bounded by the server's hard
 * deadline) than to fail fast with a misleading error.
 */
export function useHelpArticle(
  category: string | null,
  slug: string | null,
  communityId: number,
  enabled = true,
) {
  return useQuery({
    queryKey:
      category && slug
        ? HELP_KEYS.article(category, slug, communityId)
        : ['help', 'article', 'disabled'],
    enabled: enabled && Boolean(category && slug && communityId > 0),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    // Retry once on network/5xx — keeps cold-start resilient without
    // masking permanent 4xx (article missing / role-gated). React Query
    // doesn't surface status from a plain Error, so this still retries
    // 404s once; Codex flagged that as a minor latency cost — acceptable
    // until requestJson carries typed HTTP errors.
    retry: 1,
    retryDelay: 500,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        category: category!,
        slug: slug!,
        communityId: String(communityId),
      });
      return requestJson<HelpArticleResponse>(
        `/api/v1/help/article?${params}`,
        { credentials: 'include', signal },
      );
    },
  });
}

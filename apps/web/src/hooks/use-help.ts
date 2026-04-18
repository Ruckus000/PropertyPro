'use client';

import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const HELP_KEYS = {
  search: (query: string, communityId: number) =>
    ['help', 'search', query, communityId] as const,
  contextual: (path: string, communityId: number) =>
    ['help', 'contextual', path, communityId] as const,
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
// Hooks
// ---------------------------------------------------------------------------

export function useHelpSearch(query: string, communityId: number) {
  return useQuery<HelpSearchResponse>({
    queryKey: HELP_KEYS.search(query, communityId),
    queryFn: async () => {
      const params = new URLSearchParams({
        q: query,
        communityId: String(communityId),
      });
      const res = await fetch(`/api/v1/help/search?${params}`);
      if (!res.ok) throw new Error('Failed to search help articles');
      const json = (await res.json()) as { data: HelpSearchResponse };
      return json.data;
    },
    enabled: query.length >= 2 && communityId > 0,
    staleTime: 60_000,
  });
}

export function useContextualHelp(path: string, communityId: number) {
  return useQuery<HelpArticleResult[]>({
    queryKey: HELP_KEYS.contextual(path, communityId),
    queryFn: async () => {
      const params = new URLSearchParams({
        path,
        communityId: String(communityId),
      });
      const res = await fetch(`/api/v1/help/contextual?${params}`);
      if (!res.ok) throw new Error('Failed to fetch contextual help');
      const json = (await res.json()) as { data: HelpArticleResult[] };
      return json.data;
    },
    enabled: path.length > 0 && communityId > 0,
    staleTime: 300_000,
  });
}

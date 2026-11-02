'use client';

/**
 * Suggestions for the audit trail's one search box: people, documents,
 * meetings, announcements, maintenance requests and violations whose name
 * matches what the manager typed. Picking one narrows the page to it.
 *
 * Reuses the command palette's search (`GET /api/v1/search`), which already
 * applies each group's read permission and feature flag.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { AggregatedSearchResponse } from '@/lib/search/data-search-types';
import type { AuditScope } from '@/lib/audit/types';

export interface AuditSuggestion {
  key: string;
  label: string;
  /** "Person", "Document", … */
  typeLabel: string;
  detail: string | null;
  scope: AuditScope;
}

const TYPE_LABELS: Record<string, string> = {
  resident: 'Person',
  document: 'Document',
  meeting: 'Meeting',
  announcement: 'Announcement',
  maintenance: 'Maintenance request',
  violation: 'Violation',
};

/** Debounce typing so each keystroke doesn't send a request. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function toAuditSuggestions(response: AggregatedSearchResponse): AuditSuggestion[] {
  const out: AuditSuggestion[] = [];
  for (const group of response.groups) {
    if (group.status !== 'ok') continue;
    for (const result of group.results) {
      const typeLabel = TYPE_LABELS[result.entityType];
      if (!typeLabel) continue;
      const id = String(result.id);
      const scope: AuditScope =
        result.entityType === 'resident'
          ? { kind: 'person', userId: id }
          : { kind: 'item', entityType: result.entityType, resourceId: id };
      out.push({
        key: `${result.entityType}:${id}`,
        label: result.title,
        typeLabel,
        detail: result.subtitle || null,
        scope,
      });
    }
  }
  return out.slice(0, 8);
}

export function useAuditSearchSuggestions(communityId: number, text: string) {
  const q = useDebounced(text.trim(), 200);
  const query = useQuery({
    queryKey: ['audit-trail-search', communityId, q],
    enabled: q.length >= 2,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q, limit: '4', communityId: String(communityId) });
      const response = await requestJson<AggregatedSearchResponse>(`/api/v1/search?${params.toString()}`, { signal });
      return toAuditSuggestions(response);
    },
    staleTime: 30_000,
  });
  return {
    suggestions: q.length >= 2 ? (query.data ?? []) : [],
    isSearching: q.length >= 2 && query.isFetching,
    /** The text the current suggestions are for (lags typing by the debounce). */
    searchedFor: q,
  };
}

'use client';

import { useCallback, useRef, useState } from 'react';
import type { SearchGroupConfig } from '@/lib/search/group-config';
import type {
  AggregatedSearchResponse,
  SearchGroupResponse,
  SearchResultItem,
} from '@/lib/search/data-search-types';

export type DataSearchResult = SearchResultItem;
export type GroupStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface DataSearchGroup extends Omit<SearchGroupResponse, 'status'> {
  status: GroupStatus;
}

const GENERIC_SEARCH_ERROR = 'Search is temporarily unavailable for this section.';

function toLoadingGroup(group: SearchGroupConfig): DataSearchGroup {
  return {
    key: group.key,
    label: group.label,
    status: 'loading',
    totalCount: 0,
    results: [],
    durationMs: 0,
  };
}

function toErrorGroup(group: SearchGroupConfig): DataSearchGroup {
  return {
    key: group.key,
    label: group.label,
    status: 'error',
    totalCount: 0,
    results: [],
    error: GENERIC_SEARCH_ERROR,
    durationMs: 0,
  };
}

function normalizeGroups(
  searchGroups: readonly SearchGroupConfig[],
  groups: SearchGroupResponse[],
): DataSearchGroup[] {
  return searchGroups.map((group) => {
    const response = groups.find((item) => item.key === group.key);
    if (!response) {
      return {
        key: group.key,
        label: group.label,
        status: 'ok',
        totalCount: 0,
        results: [],
        durationMs: 0,
      };
    }

    return response;
  });
}

export function useDataSearch(
  communityId: number | null,
  searchGroups: readonly SearchGroupConfig[],
) {
  const [groups, setGroups] = useState<DataSearchGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setGroups([]);
    setIsSearching(false);
  }, []);

  const search = useCallback(
    (query: string) => {
      controllerRef.current?.abort();
      if (!communityId || searchGroups.length === 0) {
        setGroups([]);
        setIsSearching(false);
        return;
      }

      const controller = new AbortController();
      controllerRef.current = controller;

      setGroups(searchGroups.map(toLoadingGroup));
      setIsSearching(true);

      const params = new URLSearchParams({ q: query, limit: '3' });
      if (communityId) {
        params.set('communityId', String(communityId));
      }

      fetch(`/api/v1/search?${params.toString()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`${res.status}`);
          }
          return res.json() as Promise<AggregatedSearchResponse>;
        })
        .then((data) => {
          if (controller.signal.aborted) {
            return;
          }

          setGroups(normalizeGroups(searchGroups, data.groups));
          setIsSearching(false);
        })
        .catch((err) => {
          if (controller.signal.aborted) {
            return;
          }
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }

          setGroups(searchGroups.map(toErrorGroup));
          setIsSearching(false);
        });
    },
    [communityId, searchGroups],
  );

  return { groups, search, reset, isSearching };
}

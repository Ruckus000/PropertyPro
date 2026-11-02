'use client';

/**
 * Audit trail list for the redesigned page: one Show choice, one period, and
 * optionally a person or item, loaded 50 entries at a time, newest first.
 */
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { AuditQueryState } from '@/lib/audit/audit-query';
import type { AuditLogEntry, AuditPagePayload, AuditResourceInfo } from '@/lib/audit/types';

const PAGE_SIZE = 50;

/** API query string for a view of the trail (also used for the CSV download). */
export function auditTrailParams(communityId: number, state: AuditQueryState): URLSearchParams {
  const params = new URLSearchParams({
    communityId: String(communityId),
    // Always explicit: a request without `view` gets the API's legacy, unfiltered behaviour.
    view: state.view,
    period: state.period,
  });
  if (state.scope?.kind === 'person') params.set('person', state.scope.userId);
  if (state.scope?.kind === 'item') {
    params.set('entity', state.scope.entityType);
    params.set('item', state.scope.resourceId);
  }
  return params;
}

export function auditTrailQueryKey(communityId: number, state: AuditQueryState) {
  return [
    'audit-trail',
    communityId,
    state.view,
    state.period,
    state.scope?.kind === 'person'
      ? `person:${state.scope.userId}`
      : state.scope
        ? `item:${state.scope.entityType}:${state.scope.resourceId}`
        : 'all',
  ] as const;
}

export interface AuditTrailData {
  entries: AuditLogEntry[];
  users: Record<string, string>;
  resources: Record<string, AuditResourceInfo>;
  hiddenRoutineCount: number | null;
  scopeLabel: string | null;
}

export function useAuditTrail(communityId: number, state: AuditQueryState) {
  const query = useInfiniteQuery({
    queryKey: auditTrailQueryKey(communityId, state),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = auditTrailParams(communityId, state);
      params.set('limit', String(PAGE_SIZE));
      if (pageParam) params.set('cursor', pageParam);
      return requestJson<AuditPagePayload>(`/api/v1/audit-trail?${params.toString()}`, { signal });
    },
    getNextPageParam: (last) => (last.pagination.hasMore ? last.pagination.nextCursor : null),
    staleTime: 60_000,
  });

  const data = useMemo<AuditTrailData | null>(() => {
    const pages = query.data?.pages;
    if (!pages || pages.length === 0) return null;
    return {
      entries: pages.flatMap((p) => p.data),
      users: Object.assign({}, ...pages.map((p) => p.users)) as Record<string, string>,
      resources: Object.assign({}, ...pages.map((p) => p.resources ?? {})) as Record<string, AuditResourceInfo>,
      hiddenRoutineCount: pages[0]?.hiddenRoutineCount ?? null,
      scopeLabel: pages[0]?.scopeLabel ?? null,
    };
  }, [query.data]);

  return { ...query, auditData: data };
}

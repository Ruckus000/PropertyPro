import type { SearchGroupKey } from './group-config';

export interface SearchResultItem {
  id: string | number;
  title: string;
  subtitle: string;
  href: string;
  entityType: string;
  relevance: number;
  [key: string]: unknown;
}

export type SearchGroupStatus = 'ok' | 'error';

export interface SearchGroupResponse {
  key: SearchGroupKey;
  label: string;
  status: SearchGroupStatus;
  totalCount: number;
  results: SearchResultItem[];
  error?: string;
  durationMs: number;
}

export interface AggregatedSearchResponse {
  requestId: string;
  communityId: number;
  partial: boolean;
  groups: SearchGroupResponse[];
}

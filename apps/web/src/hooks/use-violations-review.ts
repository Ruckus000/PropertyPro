import { useQuery } from '@tanstack/react-query';
import type { ViolationSeverity } from '@propertypro/db';
import { listViolations, type ViolationItem } from '@/lib/api/violations';

export interface ViolationsReviewFilters {
  unitId?: number;
  severity?: ViolationSeverity;
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Every case matching the unit/severity/date filters, in one status-agnostic
 * walk, so status counts, the side panel and the list agree. Status filtering
 * happens in the browser. Pass `enabled: false` for viewers without Review.
 */
export function useViolationsReview(
  communityId: number,
  filters: ViolationsReviewFilters,
  enabled: boolean,
) {
  return useQuery<ViolationItem[]>({
    queryKey: ['violations-review', communityId, filters],
    enabled,
    queryFn: async ({ signal }) => {
      const res = await listViolations(communityId, { ...filters, page: 1, limit: 2000 }, signal);
      return res.data;
    },
  });
}

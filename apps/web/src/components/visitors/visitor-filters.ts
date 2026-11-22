import type { VisitorListItem } from '@/hooks/use-visitors';
import { getVisitorStatus, isOnTodayList } from './visitor-columns';

export type VisitorFilter = 'today' | 'expected' | 'checked_in' | 'all';

/** Quick-filter tabs of the staff visitor list, in display order. */
export const VISITOR_FILTER_TABS: { label: string; value: VisitorFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Expected', value: 'expected' },
  { label: 'Checked In', value: 'checked_in' },
  { label: 'All', value: 'all' },
];

export function filterVisitors(visitors: VisitorListItem[], filter: string): VisitorListItem[] {
  switch (filter) {
    case 'today':
      return visitors.filter((v) => isOnTodayList(v));
    case 'expected':
      return visitors.filter((visitor) => getVisitorStatus(visitor) === 'expected');
    case 'checked_in':
      return visitors.filter((visitor) => {
        const status = getVisitorStatus(visitor);
        return status === 'checked_in' || status === 'overstayed' || status === 'revoked_on_site';
      });
    default:
      return visitors;
  }
}

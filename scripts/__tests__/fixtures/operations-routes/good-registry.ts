// Minimal good-path registry. One operations entry, one non-operations entry.
import { operationsTabHref } from '../../../../apps/web/src/lib/operations/routes';

export const registry = [
  {
    id: 'page-maintenance',
    href: (cid: number) => operationsTabHref(cid, 'requests'),
  },
  {
    id: 'page-settings',
    href: '/settings',
  },
];

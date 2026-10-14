import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * Full-page skeleton for ARRIVING at the inbox. Thread clicks never reach it:
 * those swap only the detail pane, under `(split)/loading.tsx`. Kept above the
 * `(split)` layout on purpose — see that layout's docblock.
 */
export default function InboxLoading() {
  return <AdminPageLoading label="Loading inbox" />;
}

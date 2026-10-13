import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * Full-page skeleton for ARRIVING at `/tickets`, `/tickets/[id]` or
 * `/tickets/new`. Clicks inside the queue never reach it: those swap only the
 * detail pane, under `(split)/loading.tsx`. Kept above the `(split)` layout on
 * purpose — see that layout's docblock.
 */
export default function TicketsLoading() {
  return <AdminPageLoading label="Loading tickets" />;
}

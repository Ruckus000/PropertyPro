import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * Covers `/tickets`, `/tickets/[id]` and `/tickets/new` — a `loading.tsx`
 * creates a Suspense boundary for its whole segment subtree, and none of the
 * three needs a different skeleton.
 */
export default function TicketsLoading() {
  return <AdminPageLoading label="Loading tickets" />;
}

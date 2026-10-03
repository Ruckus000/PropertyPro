import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * The route is `force-dynamic`, so this Suspense boundary is real: the page
 * waits on one privileged Supabase read before it can render a row.
 */
export default function HealthLogsLoading() {
  return <AdminPageLoading label="Loading the operator activity log" />;
}

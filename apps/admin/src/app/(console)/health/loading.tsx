import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * The Health page runs six outbound probes with a 4 s ceiling each, so this
 * boundary is not decorative — a genuinely degraded platform is the case where
 * it renders longest, which is also the case where a blank screen is least
 * acceptable.
 */
export default function HealthLoading() {
  return <AdminPageLoading label="Loading platform health" />;
}

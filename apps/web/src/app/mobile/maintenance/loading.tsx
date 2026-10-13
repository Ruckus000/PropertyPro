import { MobileRouteLoading } from '@/components/mobile/mobile-route-loading';

/**
 * Shared-segment boundary for `/mobile/maintenance` <-> `/mobile/maintenance/new`.
 * `mobile/loading.tsx` covers moves between `/mobile`'s own children, not
 * between these two, so without this the request list stayed on screen while
 * the heaviest mobile route (the new-request form) rendered and loaded.
 */
export default function MobileMaintenanceLoading() {
  return <MobileRouteLoading label="Loading maintenance" />;
}

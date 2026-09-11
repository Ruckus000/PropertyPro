import { AdminPageLoading } from '@/components/loading/AdminPageLoading';

/**
 * `/billing`'s loading state. The route is `force-dynamic` and reads Stripe
 * over the network (up to five paged list calls), so this boundary is real and
 * routinely visible — unlike a cached page's, which never paints.
 */
export default function BillingLoading() {
  return <AdminPageLoading label="Loading billing" />;
}

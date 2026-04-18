import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityPaymentsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="payments"
      label="Loading community payments"
    />
  );
}

import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityFinanceLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="finance"
      label="Loading finance dashboard"
    />
  );
}

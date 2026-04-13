import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityOperationsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="operations"
      label="Loading operations hub"
    />
  );
}

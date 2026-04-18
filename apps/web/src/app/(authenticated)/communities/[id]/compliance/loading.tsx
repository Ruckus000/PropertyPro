import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityComplianceLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="compliance"
      label="Loading compliance dashboard"
    />
  );
}

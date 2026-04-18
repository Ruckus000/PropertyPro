import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityDocumentsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="documents"
      label="Loading community documents"
    />
  );
}

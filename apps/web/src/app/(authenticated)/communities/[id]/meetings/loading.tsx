import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function CommunityMeetingsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="meetings"
      label="Loading community meetings"
    />
  );
}

import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function AnnouncementsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="announcements"
      label="Loading announcements"
    />
  );
}

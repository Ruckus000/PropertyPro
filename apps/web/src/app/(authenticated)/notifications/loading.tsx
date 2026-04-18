import { AuthenticatedRouteLoading } from '@/components/layout/authenticated-route-loading';

export default function NotificationsLoading() {
  return (
    <AuthenticatedRouteLoading
      variant="notifications"
      label="Loading notifications"
    />
  );
}

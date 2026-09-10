/**
 * /health — placeholder for the Wave 3 health board (spec D18-D20).
 *
 * The rail has linked here since Wave 1, and an unmatched URL renders the ROOT
 * not-found, which sits OUTSIDE this route group: no rail, no top bar, no way
 * back. So the route has to exist for the nav entry to be honest. Wave 3
 * replaces this body in place — keep the session call when it does.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { Activity } from 'lucide-react';
import { EmptyState, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireAdminPageSession();

  return (
    <PageBody>
      <AdminPageHeader title="Health" />
      <EmptyState
        icon={Activity}
        title="The health board isn't built yet"
        description="Service probes, error rates and failed jobs will land here. Until they do, scheduled-job health answers at /api/v1/internal/cron-health on the web app, and runtime errors are in Sentry."
      />
    </PageBody>
  );
}

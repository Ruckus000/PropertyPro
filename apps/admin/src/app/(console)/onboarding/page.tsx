/**
 * /onboarding — placeholder for the Wave 3 onboarding surface (spec D21).
 *
 * The rail has linked here since Wave 1, and an unmatched URL renders the ROOT
 * not-found, which sits OUTSIDE this route group: no rail, no top bar, no way
 * back. So the route has to exist for the nav entry to be honest. Wave 3
 * replaces this body in place — keep the session call when it does.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import Link from 'next/link';
import { Rocket } from 'lucide-react';
import { Button, EmptyState, PageBody } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  await requireAdminPageSession();

  return (
    <PageBody>
      <AdminPageHeader title="Onboarding" />
      <EmptyState
        icon={Rocket}
        title="Onboarding tracking isn't built yet"
        description="How far each new community has got through setup will be tracked here. Clients already lists every community with its plan and compliance state."
        action={
          <Button asChild>
            <Link href="/clients">Go to Clients</Link>
          </Button>
        }
      />
    </PageBody>
  );
}

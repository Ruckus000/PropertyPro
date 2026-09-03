/**
 * PM Portfolio Templates — `/pm/portfolio/templates` (PT-PR6).
 *
 * A property manager's personal library of reusable site-branding templates.
 * Save a community's brand as a template, then bulk-apply it across the
 * communities you manage. Gated to the Operations Plus plan
 * (`hasSitePortfolioTemplates`); non-PMs are redirected away.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity, listManagedCommunitiesForPm } from '@/lib/api/pm-communities';
import { userHasPortfolioTemplatesAccess } from '@/lib/services/site-portfolio-template-service';
import { PortfolioTemplatesManager } from '@/components/pm/portfolio/PortfolioTemplatesManager';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';

export default async function PortfolioTemplatesPage() {
  const userId = await requirePageAuthenticatedUserId();

  if (!(await isPmAdminInAnyCommunity(userId))) {
    redirect('/dashboard');
  }

  const [hasAccess, managed] = await Promise.all([
    userHasPortfolioTemplatesAccess(userId),
    listManagedCommunitiesForPm(userId),
  ]);

  const communities = managed.map((c) => ({ communityId: c.communityId, name: c.communityName }));

  return (
    <PageBody width="reading" spacing="none">
      <PageHeader title="Portfolio Templates" />
      <PortfolioTemplatesManager hasAccess={hasAccess} communities={communities} />
    </PageBody>
  );
}

import { createScopedClient, communities, faqs } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { PageHeader } from '@/components/shared/page-header';
import { HelpHubContent } from '@/components/help/help-hub-content';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { buildHelpTaskCardsFromFeatures } from '@/lib/help/task-cards';
import { ensureFaqsExist, filterFaqsForRole } from '@/lib/services/faq-service';
import { getFeaturedForRole } from '@/lib/services/help-article-service';

interface HelpPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help');

  await ensureFaqsExist(context.communityId);

  const scoped = createScopedClient(context.communityId);
  const [faqRows, communityRows, featuredArticles] = await Promise.all([
    scoped.query(faqs),
    scoped.selectFrom(communities, {}, eq(communities.id, context.communityId)),
    getFeaturedForRole(context.membership.role),
  ]);
  const community = communityRows[0] as Record<string, unknown> | undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Help Center"
        description="Search guides, browse common tasks, and find answers for your community."
      />
      <HelpHubContent
        communityId={context.communityId}
        isAdmin={context.membership.isAdmin}
        taskCards={buildHelpTaskCardsFromFeatures(
          context.communityId,
          context.features,
          context.membership.isAdmin,
        )}
        featuredArticles={featuredArticles}
        faqs={filterFaqsForRole(faqRows, context.membership.role)}
        contact={{
          name: (community?.['contactName'] as string | null | undefined) ?? null,
          email: (community?.['contactEmail'] as string | null | undefined) ?? null,
          phone: (community?.['contactPhone'] as string | null | undefined) ?? null,
        }}
      />
    </div>
  );
}

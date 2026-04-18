import { createScopedClient, communities, faqs } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { HelpHubContent } from '@/components/help/help-hub-content';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { buildHelpTaskCardsFromFeatures } from '@/lib/help/task-cards';
import { ensureFaqsExist, filterFaqsForRole } from '@/lib/services/faq-service';
import { getFeaturedForRole } from '@/lib/services/help-article-service';

interface HelpPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface CommunityContactRecord {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

function toCommunityContact(
  row: Record<string, unknown> | undefined,
): CommunityContactRecord {
  const readNullableString = (value: unknown): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;

  return {
    contactName: readNullableString(row?.['contactName']),
    contactEmail: readNullableString(row?.['contactEmail']),
    contactPhone: readNullableString(row?.['contactPhone']),
  };
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help');
  const effectiveRole = context.membership.presetKey ?? context.membership.role;

  await ensureFaqsExist(context.communityId);

  const scoped = createScopedClient(context.communityId);
  const [faqRows, communityRows] = await Promise.all([
    scoped.query(faqs),
    scoped.selectFrom(communities, {}, eq(communities.id, context.communityId)),
  ]);
  const contact = toCommunityContact(
    communityRows[0] as Record<string, unknown> | undefined,
  );

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
        featuredArticles={getFeaturedForRole(effectiveRole)}
        faqs={filterFaqsForRole(faqRows, effectiveRole)}
        contact={{
          name: contact.contactName,
          email: contact.contactEmail,
          phone: contact.contactPhone,
        }}
      />
    </div>
  );
}

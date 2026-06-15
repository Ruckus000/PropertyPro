import { redirect } from 'next/navigation';
import { createScopedClient, faqs } from '@propertypro/db';
import { HelpSearchInput } from '@/components/help/help-search-input';
import { HelpSearchResults } from '@/components/help/help-search-results';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
import { ensureFaqsExist, filterFaqsForRole } from '@/lib/services/faq-service';
import { searchArticles } from '@/lib/services/help-article-service';

interface HelpSearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default async function HelpSearchPage({
  searchParams,
}: HelpSearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help/search');
  const effectiveRole = resolveHelpViewerRoleFromMembership(context.membership);
  const query = toSearchValue(resolvedSearchParams.q).trim();

  if (!query) {
    redirect(`/help?communityId=${context.communityId}`);
  }

  await ensureFaqsExist(context.communityId);

  const scoped = createScopedClient(context.communityId);
  const faqRows = await scoped.query(faqs);
  const faqResults = filterFaqsForRole(faqRows, effectiveRole).filter((faq) => {
    const haystack = `${faq.question} ${faq.answer} ${faq.category ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Help Search"
        description={`Results for "${query}" across platform guides and community FAQs.`}
      />
      <HelpSearchInput communityId={context.communityId} defaultValue={query} autoFocus />
      <HelpSearchResults
        communityId={context.communityId}
        query={query}
        articleResults={searchArticles(query, effectiveRole)}
        faqResults={faqResults}
      />
    </div>
  );
}

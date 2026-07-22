import { redirect } from 'next/navigation';
import { createScopedClient, faqs } from '@propertypro/db';
import { HelpFaqManageClient } from '@/components/help/help-faq-manage-client';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { ensureFaqsExist, sortFaqs } from '@/lib/services/faq-service';

interface HelpManagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpManagePage({
  searchParams,
}: HelpManagePageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help/manage');

  if (!context.membership.isAdmin) {
    redirect(`/help?communityId=${context.communityId}`);
  }

  await ensureFaqsExist(context.communityId);

  const scoped = createScopedClient(context.communityId);
  const faqRows = await scoped.query(faqs);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Manage FAQs"
        description="Review and update the quick-answer help content shown to this community."
      />
      <HelpFaqManageClient
        communityId={context.communityId}
        initialFaqs={sortFaqs(faqRows).map((faq) => ({
          id: faq['id'] as number,
          question: faq['question'] as string,
          answer: faq['answer'] as string,
          sortOrder: (faq['sortOrder'] as number | null | undefined) ?? 0,
        }))}
      />
    </div>
  );
}

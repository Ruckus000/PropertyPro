export const dynamic = 'force-dynamic';

/**
 * Mobile Help Center page.
 * Server component: auth + FAQ fetch, then hands off to client content.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requirePageAuthenticatedUser as requireAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import { MobileHelpContent } from '@/components/mobile/MobileHelpContent';

export default async function MobileHelpPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;

  try {
    const user = await requireAuthenticatedUser();
    userId = user.id;
  } catch {
    redirect('/auth/login');
  }

  let isAdmin = false;

  try {
    const membership = await requireCommunityMembership(communityId, userId!);
    isAdmin = membership.isAdmin;
  } catch {
    redirect('/auth/login');
  }

  // Lazy-seed default FAQs if none exist, then fetch
  await ensureFaqsExist(communityId);
  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);

  const sortedFaqs = [...faqRows]
    .sort((a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0))
    .map((f) => ({
      id: f['id'] as number,
      question: f['question'] as string,
      answer: f['answer'] as string,
    }));

  return (
    <MobileHelpContent
      faqs={sortedFaqs}
      isAdmin={isAdmin}
      communityId={communityId}
    />
  );
}

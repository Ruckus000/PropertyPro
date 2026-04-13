import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import { PageHeader } from '@/components/shared/page-header';

/**
 * Desktop FAQ Management page.
 *
 * Minimal v1: displays existing FAQs with links to the mobile manage page
 * which already has full CRUD. A dedicated desktop editor is a v1.1 enhancement.
 */
export default async function HelpManagePage() {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  const communityId = communityIdStr ? parseInt(communityIdStr, 10) : NaN;

  if (isNaN(communityId)) {
    redirect('/help');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    redirect('/help');
  }

  await ensureFaqsExist(communityId);
  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);
  const sortedFaqs = [...faqRows].sort(
    (a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">Help</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">Manage FAQs</span>
      </nav>

      <PageHeader title="Manage FAQs" description="Create, edit, and reorder community FAQs" />

      <div className="mt-6 space-y-3">
        {sortedFaqs.map((faq, index) => (
          <div
            key={faq['id'] as number}
            className="flex items-start gap-4 rounded-[var(--radius-md)] border border-edge bg-surface-card p-4"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-content-tertiary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content">{faq['question'] as string}</p>
              <p className="mt-1 text-xs text-content-tertiary line-clamp-2">{faq['answer'] as string}</p>
              {!!faq['category'] && (
                <span className="mt-2 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-content-tertiary capitalize">
                  {(faq['category'] as string).replace(/-/g, ' ')}
                </span>
              )}
            </div>
          </div>
        ))}

        {sortedFaqs.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-8 text-center">
            <p className="text-sm text-content-secondary">No FAQs yet. Create your first FAQ to help residents find answers.</p>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-content-tertiary">
        Full FAQ editing (create, edit, delete, reorder) is currently available on the{' '}
        <Link href={`/mobile/help/manage?communityId=${communityId}`} className="text-[var(--interactive-primary)] hover:underline">
          mobile management page
        </Link>
        . A desktop editor is coming soon.
      </p>
    </div>
  );
}

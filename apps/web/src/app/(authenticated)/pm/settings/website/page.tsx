/**
 * PR #1b: PM website editor — Welcome tab only.
 *
 * Route: /pm/settings/website?communityId=X
 * Auth: pm_admin role required.
 *
 * PR #1b ships the Hero block editor. PR #5 adds the full onboarding flow,
 * PR #8 ships the full 5-tab editor + draft/preview/publish workflow.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { heroBlockSchema, type HeroBlockContent } from '@propertypro/shared';
import { HeroBlockForm } from '@/components/pm/site-editor/HeroBlockForm';
import { ContentSectionsList } from '@/components/pm/site-editor/ContentSectionsList';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Select a Community</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Choose a community from the Communities list to customize its public site.
        </p>
        <a
          href="/pm/dashboard/communities"
          className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Go to Communities
        </a>
      </main>
    );
  }

  const communityId = rawId;
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (membership.role !== 'pm_admin') {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  // Load current hero from the published block set (PR #1b writes published only)
  const reader = getPublicCommunityScopedReader(communityId);
  const blocks = await reader.listSiteBlocks();
  const heroRaw = blocks.find((b) => b.blockType === 'hero')?.content;
  let initial: HeroBlockContent | null = null;
  if (heroRaw != null) {
    const parsed = heroBlockSchema.safeParse(heroRaw);
    if (parsed.success) initial = parsed.data;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-content">Website</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Customize the welcome panel that visitors see at{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
            [your-community].getpropertypro.com
          </code>
          . Saving immediately publishes the change in PR #1b — draft/preview/publish lands in PR #8.
        </p>
      </div>

      <section aria-labelledby="welcome-tab" className="rounded-md border border-default bg-surface-card p-6 shadow-e0">
        <h2 id="welcome-tab" className="mb-4 text-lg font-medium text-content">
          Welcome
        </h2>
        <HeroBlockForm communityId={communityId} initial={initial} />
      </section>

      <div className="mt-8">
        <ContentSectionsList communityId={communityId} />
      </div>
    </div>
  );
}

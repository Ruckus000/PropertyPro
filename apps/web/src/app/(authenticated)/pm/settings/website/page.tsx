/**
 * PR #1b: PM website editor — Welcome tab only.
 *
 * Route: /pm/settings/website?communityId=X
 * Auth: pm_admin or cam role required.
 *
 * PR #1b ships the Hero block editor. PR #5 adds the full onboarding flow,
 * PR #8 ships the full 5-tab editor + draft/preview/publish workflow.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole } from '@/lib/api/role-guard';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { getCommunityPublicInfo } from '@/lib/api/branding';
import { buildCommunityUrl } from '@/lib/utils/community-url';
import { heroBlockSchema, type HeroBlockContent } from '@propertypro/shared';
import { HeroBlockForm } from '@/components/pm/site-editor/HeroBlockForm';
import { ContentSectionsList } from '@/components/pm/site-editor/ContentSectionsList';
import { PublishBar } from '@/components/pm/site-editor/PublishBar';

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
  if (!hasRole(membership, ['pm_admin', 'cam'])) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  // PR #8e — load hero from the merged draft+published view so the form
  // seeds with whatever the PM is currently iterating on, not the last
  // published version.
  const reader = getPublicCommunityScopedReader(communityId);
  const blocks = await reader.listSiteBlocks({ includeDrafts: true });
  const heroRaw = blocks.find((b) => b.blockType === 'hero')?.content;
  let initial: HeroBlockContent | null = null;
  if (heroRaw != null) {
    const parsed = heroBlockSchema.safeParse(heroRaw);
    if (parsed.success) initial = parsed.data;
  }

  const communityInfo = await getCommunityPublicInfo(communityId);
  const previewUrl = communityInfo
    ? buildCommunityUrl(communityInfo.slug, '/?preview=true')
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-content">Website</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Customize the welcome panel that visitors see at{' '}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
              [your-community].getpropertypro.com
            </code>
            . Use <strong className="font-medium">Publish Website</strong> at the bottom to make
            your changes live.
          </p>
        </div>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="preview-draft-link"
            className="inline-flex shrink-0 items-center rounded-md border border-default bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            Preview Draft
          </a>
        )}
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

      <PublishBar communityId={communityId} />
    </div>
  );
}

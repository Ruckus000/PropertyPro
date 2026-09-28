import { getCommunityContact } from '@/lib/services/community-contact-service';
import { HelpHubContent } from '@/components/help/help-hub-content';
import { StartHereHero } from '@/components/help/start-here-hero';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { resolveHelpViewerTokens } from '@/lib/help/viewer-role';
import { getReadArticleSlugs } from '@/lib/help/read-state';
import { buildHelpTaskCardsFromFeatures } from '@/lib/help/task-cards';
import {
  getStartHereContentForRole,
  resolveStartHereArticles,
} from '@/lib/help/start-here';
import {
  getAllArticles,
  getFeaturedForRole,
} from '@/lib/services/help-article-service';

interface HelpPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const resolvedSearchParams = await searchParams;
  const context = await requireHelpPageContext(resolvedSearchParams, '/help');
  const viewer = resolveHelpViewerTokens(context.membership);

  const [community, readSlugs] = await Promise.all([
    getCommunityContact(context.communityId),
    getReadArticleSlugs(context.communityId, context.userId),
  ]);

  const startHereContent = getStartHereContentForRole(viewer);
  const startHereArticles = resolveStartHereArticles(
    startHereContent,
    getAllArticles(),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Help Center"
        description="Search guides, browse common tasks, and find answers for your community."
      />
      <StartHereHero
        communityId={context.communityId}
        content={startHereContent}
        articles={startHereArticles}
        readSlugs={readSlugs}
      />
      <HelpHubContent
        communityId={context.communityId}
        isAdmin={context.membership.isAdmin}
        taskCards={buildHelpTaskCardsFromFeatures(
          context.communityId,
          context.features,
          context.membership.isAdmin,
        )}
        featuredArticles={getFeaturedForRole(viewer)}
        contact={{
          name: community.contactName,
          email: community.contactEmail,
          phone: community.contactPhone,
        }}
      />
    </div>
  );
}

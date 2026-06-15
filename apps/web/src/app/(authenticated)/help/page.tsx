import { createScopedClient, communities, type Community } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { HelpHubContent } from '@/components/help/help-hub-content';
import { StartHereHero } from '@/components/help/start-here-hero';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
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
  const effectiveRole = resolveHelpViewerRoleFromMembership(context.membership);

  const scoped = createScopedClient(context.communityId);
  const [communityRows, readSlugs] = await Promise.all([
    scoped.selectFrom(
      communities,
      {},
      eq(communities.id, context.communityId),
    ),
    getReadArticleSlugs(context.communityId, context.userId),
  ]);
  const community = communityRows[0] as Community | undefined;

  const startHereContent = getStartHereContentForRole(effectiveRole);
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
        featuredArticles={getFeaturedForRole(effectiveRole)}
        contact={{
          name: community?.contactName ?? null,
          email: community?.contactEmail ?? null,
          phone: community?.contactPhone ?? null,
        }}
      />
    </div>
  );
}

/**
 * Shared server setup for the Help Center pages: resolve the reader (with any
 * `?type=` preview), their visible articles, and the frame props.
 */
import { requireHelpPageContext, type HelpPageContext } from '@/lib/help/page-context';
import {
  buildHelpTypeBar,
  groupHelpTopics,
  helpHref,
  portalHref,
  sectionCopy,
  type HelpTopic,
} from '@/lib/help/center';
import { isPreviewingType, resolveHelpReader, type HelpReader } from '@/lib/help/reader';
import {
  getArticlesForReader,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';

type SearchParams = Record<string, string | string[] | undefined>;

export interface HelpCenterPage {
  context: HelpPageContext;
  reader: HelpReader;
  articles: HelpArticleMetadata[];
  topics: HelpTopic[];
  copy: ReturnType<typeof sectionCopy>;
  href: (path: string) => string;
  /** Props for <HelpCenterShell>, given what the page is showing. */
  shell: (options: {
    currentPath: string;
    currentTopic?: string | null;
    currentArticle?: HelpArticleMetadata | null;
    showHeaderSearch?: boolean;
    query?: string;
  }) => {
    communityName: string;
    homeHref: string;
    portalHref: string;
    showHeaderSearch: boolean;
    query?: string;
    searchScope: { communityId: number; type?: string };
    typeBar: ReturnType<typeof buildHelpTypeBar>;
    sidebarLabel: string;
    topics: Array<{ key: string; label: string; href: string; count: number; current: boolean }>;
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadHelpCenterPage(
  searchParams: SearchParams,
  pathname: string,
): Promise<HelpCenterPage> {
  const context = await requireHelpPageContext(searchParams, pathname);
  const reader = resolveHelpReader(context.membership, firstParam(searchParams.type));
  const articles = getArticlesForReader(reader);
  const topics = groupHelpTopics(articles);
  const copy = sectionCopy(reader, context.membership.communityName);
  const href = (path: string) => helpHref(path, context.communityId, reader);

  return {
    context,
    reader,
    articles,
    topics,
    copy,
    href,
    shell: ({ currentPath, currentTopic = null, currentArticle = null, showHeaderSearch = true, query }) => ({
      communityName: context.membership.communityName,
      homeHref: href('/help'),
      portalHref: portalHref(
        context.membership,
        context.communityId,
        currentArticle?.category ?? currentTopic,
        reader.section,
      ),
      showHeaderSearch,
      query,
      searchScope: {
        communityId: context.communityId,
        type: isPreviewingType(reader) ? reader.communityType : undefined,
      },
      typeBar: buildHelpTypeBar(reader, context.communityId, currentPath, currentArticle),
      sidebarLabel: `Help for ${copy.labelLower}`,
      topics: topics.map((topic) => ({
        key: topic.key,
        label: topic.label,
        href: href(`/help/${topic.key}`),
        count: topic.articles.length,
        current: topic.key === currentTopic,
      })),
    }),
  };
}

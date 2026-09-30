/**
 * View-model helpers for the Help Center pages (app/(help)/help/**).
 */
import { COMMUNITY_TYPES, getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { NAV_ITEMS, getVisibleItems, resolveDashboardHref } from '@/components/layout/nav-config';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { HELP_CATEGORY_ORDER, getHelpCategoryMeta } from '@/lib/help/category-meta';
import { helpQuery, isPreviewingType, type HelpReader } from '@/lib/help/reader';
import {
  HELP_COMMUNITY_TYPE_META,
  HELP_SECTION_META,
  previewableTypes,
} from '@/lib/help/sections';
import {
  isArticleVisibleToReader,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';

export interface HelpTopic {
  key: string;
  label: string;
  articles: HelpArticleMetadata[];
}

/** The reader's articles grouped into topics, in topic order. Empty topics are dropped. */
export function groupHelpTopics(articles: readonly HelpArticleMetadata[]): HelpTopic[] {
  return HELP_CATEGORY_ORDER.map((key) => ({
    key,
    label: getHelpCategoryMeta(key).label,
    articles: articles.filter((article) => article.category === key),
  })).filter((topic) => topic.articles.length > 0);
}

export function helpHref(path: string, communityId: number, reader: HelpReader): string {
  return `${path}?${helpQuery(communityId, reader)}`;
}

export function articleHref(
  article: Pick<HelpArticleMetadata, 'category' | 'slug'>,
  communityId: number,
  reader: HelpReader,
): string {
  return helpHref(`/help/${article.category}/${article.slug}`, communityId, reader);
}

export function guideCount(n: number): string {
  return `${n} ${n === 1 ? 'guide' : 'guides'}`;
}

export interface HelpTypeOption {
  type: CommunityType;
  label: string;
  href: string;
  current: boolean;
  mine: boolean;
}

export interface HelpTypeBar {
  previewing: boolean;
  text: string;
  options: HelpTypeOption[];
}

/**
 * The community-type bar (managers only). `currentPath` is
 * kept when the current article exists for a type; otherwise that option goes
 * to the help home.
 */
export function buildHelpTypeBar(
  reader: HelpReader,
  communityId: number,
  currentPath: string,
  currentArticle?: HelpArticleMetadata | null,
): HelpTypeBar | null {
  const types = previewableTypes(reader.section);
  if (types.length === 0) return null;
  const typeLabel = (type: CommunityType) => HELP_COMMUNITY_TYPE_META[type].label;
  const previewing = isPreviewingType(reader);
  return {
    previewing,
    text: previewing
      ? `Previewing help for ${HELP_COMMUNITY_TYPE_META[reader.communityType].plural}. Your community is ${aOrAn(typeLabel(reader.ownCommunityType).toLowerCase())}.`
      : `Showing help for ${HELP_COMMUNITY_TYPE_META[reader.communityType].plural}.`,
    options: types.map((type) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (type !== reader.ownCommunityType) params.set('type', type);
      const keepsPath =
        !currentArticle ||
        isArticleVisibleToReader(currentArticle, {
          section: reader.section,
          boardSeat: reader.boardSeat,
          communityType: type,
          features: getFeaturesForCommunity(type),
        });
      return {
        type,
        label: typeLabel(type),
        href: `${keepsPath ? currentPath : '/help'}?${params.toString()}`,
        current: type === reader.communityType,
        mine: type === reader.ownCommunityType,
      };
    }),
  };
}

function aOrAn(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

export function sectionCopy(reader: HelpReader, communityName: string) {
  const meta = HELP_SECTION_META[reader.section];
  return {
    label: meta.label,
    labelLower: meta.label.toLowerCase(),
    who: meta.who,
    blurb: meta.blurb,
    heroTitle:
      reader.section === 'manager' ? `How can we help you run ${communityName}?` : 'How can we help?',
    searchPlaceholder:
      reader.section === 'manager'
        ? 'Search, e.g. meeting notice, upload, work order'
        : 'Search, e.g. pay dues, maintenance, documents',
    noResultsSuggestion:
      reader.section === 'manager' ? '“notice”, “upload” or “assessment”' : '“pay”, “repair” or “minutes”',
  };
}

/** Sidebar item each topic's "Back to PropertyPro" returns to, by section. */
const TOPIC_NAV: Record<string, string | Partial<Record<HelpReader['section'], string>>> = {
  documents: 'documents',
  meetings: 'meetings',
  announcements: 'announcements',
  compliance: 'compliance',
  payments: 'payments',
  maintenance: 'operations',
  violations: { manager: 'violations-inbox', resident: 'violations-report' },
  board: 'board',
  esign: 'esign',
  residents: 'residents',
  leases: 'leases',
  apartment: 'packages',
  building: 'insurance',
  website: 'website',
};

/**
 * "Back to PropertyPro": the page the article is about when the reader can
 * open it, otherwise their dashboard. The PM portfolio topic returns to the
 * portfolio.
 */
export function portalHref(
  membership: Pick<CommunityMembership, 'role' | 'isUnitOwner' | 'communityType'>,
  communityId: number,
  category: string | null,
  section: HelpReader['section'],
): string {
  // The reader's own community, even while previewing another type's help.
  const features = getFeaturesForCommunity(membership.communityType);
  const dashboard = resolveDashboardHref(communityId, features);
  if (!category) return dashboard;
  if (category === 'pm' && section === 'manager') return '/pm/dashboard/communities';
  const target = TOPIC_NAV[category];
  const navId = typeof target === 'string' ? target : target?.[section];
  if (!navId) return dashboard;
  const visible = getVisibleItems(NAV_ITEMS, membership.role, features, membership.isUnitOwner);
  const item = visible.find((candidate) => candidate.id === navId);
  return item ? item.href(communityId) : dashboard;
}

export function isCommunityType(value: unknown): value is CommunityType {
  return typeof value === 'string' && (COMMUNITY_TYPES as readonly string[]).includes(value);
}

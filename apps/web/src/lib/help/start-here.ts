/**
 * Role-aware "Start here" hero mapping for the help hub.
 *
 * The 2026-05-07 audit found the hub showed every user the same buffet of
 * categories with no first-run path. This map gives every authenticated role
 * a 3–4 article jumpstart that answers the question "what do I do first?"
 *
 * Slugs MUST resolve to articles in apps/web/src/content/help/. The
 * `verify-help-content.ts` guard would catch a typo in `featureGates`, but
 * the slug list here is independently maintained. Adding new entries:
 *
 *   1. Use `pnpm help:preview <article.mdx>` to confirm the article's slug.
 *   2. Add to the role's array (or DEFAULT_SLUGS for fallback).
 *   3. Run `pnpm test --run __tests__/help/start-here-role.test.ts` to
 *      verify resolution against the live corpus.
 */

import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

export interface StartHereCta {
  href: string;
  label: string;
}

export interface StartHereContent {
  /** Heading shown above the article tiles. Tailored to the role. */
  headline: string;
  /** One-line subhead under the headline. */
  subhead: string;
  /** Article slugs in display order. Missing slugs are silently dropped. */
  slugs: readonly string[];
  /** Optional primary CTA at the right edge of the hero header. */
  cta?: StartHereCta;
}

const DEFAULT_SLUGS: readonly string[] = [
  'welcome-to-propertypro',
  'understanding-your-dashboard',
  'finding-community-documents',
  'using-the-mobile-app',
];

const MANAGER_SLUGS: readonly string[] = [
  'managing-multiple-communities',
  'running-portfolio-reports',
  'reviewing-the-compliance-dashboard',
  'sending-bulk-announcements-and-documents',
];

const TENANT_SLUGS: readonly string[] = [
  'welcome-to-propertypro',
  'joining-your-community',
  'submitting-a-maintenance-request',
  'using-the-mobile-app',
];

const OWNER_SLUGS: readonly string[] = [
  'welcome-to-propertypro',
  'paying-dues-and-assessments',
  'submitting-a-maintenance-request',
  'understanding-your-assessment-balance',
];

// Keyed by the viewer's BASE audience (resolveHelpViewerTokens' first token).
// A board designation does not change the hero: a board member is an owner or
// tenant here, and the old board/CAM/site-manager entries were unreachable (the
// resolver never produced those keys) and pointed at manager-only articles.
const ROLE_MAP: Readonly<Record<string, StartHereContent>> = {
  owner: {
    headline: 'Get the most out of PropertyPro',
    subhead: 'Pay assessments, track requests, and stay on top of your community.',
    slugs: OWNER_SLUGS,
  },
  tenant: {
    headline: 'Welcome — start here',
    subhead: 'A short orientation tour so you can find what you need fast.',
    slugs: TENANT_SLUGS,
  },
  manager: {
    headline: 'Manage your portfolio',
    subhead: 'Multi-community workflows and reports built for PMs.',
    slugs: MANAGER_SLUGS,
  },
};

const DEFAULT_CONTENT: StartHereContent = {
  headline: 'Start here',
  subhead: 'A short orientation so you can find what you need fast.',
  slugs: DEFAULT_SLUGS,
};

/**
 * Returns the Start Here content for a role, falling back to a generic set
 * if the role isn't mapped. The CTA links into `/help/getting-started` so
 * users can reach the full orientation arc.
 */
export function getStartHereContentForRole(viewer: readonly string[]): StartHereContent {
  const baseAudience = viewer[0];
  const base = (baseAudience && ROLE_MAP[baseAudience]) || DEFAULT_CONTENT;
  return {
    ...base,
    cta: {
      href: '/help/getting-started',
      label: 'Take the orientation tour',
    },
  };
}

/**
 * Resolves an ordered StartHereContent into actual article metadata, dropping
 * any slugs that don't resolve. Order is preserved.
 */
export function resolveStartHereArticles(
  content: StartHereContent,
  allArticles: readonly HelpArticleMetadata[],
): HelpArticleMetadata[] {
  const bySlug = new Map(allArticles.map((a) => [a.slug, a]));
  const resolved: HelpArticleMetadata[] = [];
  for (const slug of content.slugs) {
    const article = bySlug.get(slug);
    if (article) resolved.push(article);
  }
  return resolved;
}

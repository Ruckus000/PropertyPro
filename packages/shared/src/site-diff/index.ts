/**
 * The site change model — the typed diff between a community's draft and its
 * last published state, plus the validators and contrast gate that decide
 * whether that draft may be published.
 *
 * Lives in `packages/shared` because publish-time validation must run
 * server-side too: a gate that exists only in the editor is a suggestion.
 */
export * from './types';
export { stableStringify, fingerprint, parseSectionContent, zodIssuesToFields } from './canonical';
export type { ParsedSection, FieldIssue } from './canonical';
export { diffSite, sectionTitle } from './diff';
export { diffPages, isLazyDraftHome, pageTitle, publishedPageBaseline } from './diff-pages';
export { blockIssues, heroIssues, siteIssues, publishBlocked } from './validate';
export type { SiteIssuesOptions } from './validate';
export { pageIssues, SITE_PAGE_SLUG_PATTERN, HOME_PAGE_SLUG } from './pages';
export type { PageForValidation, PageIssuesInput } from './pages';
export {
  parseHex,
  relativeLuminance,
  contrastRatio,
  contrastIssues,
  AA_NORMAL_TEXT_RATIO,
} from './contrast';
export type { Rgb, ResolvedBrandColors, ContrastIssueOptions } from './contrast';

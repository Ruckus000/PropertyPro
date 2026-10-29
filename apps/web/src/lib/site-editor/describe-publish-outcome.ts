import type { PublishSiteResult } from '@/hooks/use-publish-site';

/**
 * What a SUCCESSFUL publish did, in one sentence.
 *
 * Counts sections AND pages. A sentence that counted only sections would tell a
 * PM whose publish put a page on their site that "0 sections" went live, so
 * every clause is built from the counts the server reported.
 *
 * ## The shape
 *
 * Clause-built, each omitted at zero — which is what preserves the original
 * section-only sentences verbatim rather than rewording every publish that has
 * nothing to do with pages.
 *
 * The caller owns the surrounding copy; only the counts are shared. The
 * `published: false` case is deliberately NOT here: it is a report on a click
 * the PM was invited to make, and belongs to the surface that offered it.
 */
export function describePublishedCounts(
  result: Extract<PublishSiteResult, { published: true }>,
): string {
  const { promotedCount, retiredCount, addedPageCount = 0, removedPageCount = 0 } = result;

  const clauses: string[] = [];
  if (promotedCount > 0) clauses.push(`${plural(promotedCount, 'section')} live`);
  if (retiredCount > 0) clauses.push(`${plural(retiredCount, 'section')} removed`);
  // "page added", not "page live": a page IS live once published, but the PM's
  // mental model of the action is that they added one.
  if (addedPageCount > 0) clauses.push(`${plural(addedPageCount, 'page')} added`);
  // Named separately from sections even though both say "removed", because the
  // qualifier is the whole point — "1 page removed" is a different loss from
  // "1 section removed", and the page took its sections with it.
  if (removedPageCount > 0) clauses.push(`${plural(removedPageCount, 'page')} removed`);

  // Reachable only from a server that reported no counts at all for a publish
  // that nonetheless did something — a browser tab older or newer than the
  // server it is talking to, which is routine mid-deploy. Better a true vague
  // sentence than a confident "0 sections live".
  if (clauses.length === 0) return 'Published — your changes are live.';

  return `Published — ${clauses.join(', ')}.`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

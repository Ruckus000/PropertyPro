import type { PublishSiteResult } from '@/hooks/use-publish-site';

/**
 * What a SUCCESSFUL publish did, in one sentence.
 *
 * ## Why this is shared rather than written where it is used
 *
 * Two surfaces publish a community site — the editor's review sheet and the
 * onboarding wizard's final step — and they had two independent sentences. The
 * wizard's counted only sections:
 *
 *     `Published — ${result.promotedCount} section${…} live.`
 *
 * which is the exact bug fixed in the sheet, still live in the wizard. It is
 * reachable, and the path is short: the wizard is entered FROM the editor (see
 * `WizardEntryBanner`, rendered by `EditorRoot` whenever onboarding is
 * incomplete), and the Pages tool is available the whole time. So a PM can
 * create a page, click through to the wizard, publish — and be told
 * "Published — 0 sections live." for a publish that put a page on their site.
 *
 * An earlier version of this change left the wizard alone on the grounds that
 * it "has no Pages panel, so it cannot reach a page-only publish". That was
 * wrong: the wizard does not need one, because the editor is upstream of it.
 *
 * ## The shape
 *
 * Clause-built, each omitted at zero — which is what preserves the original
 * section-only sentences verbatim rather than rewording every publish that has
 * nothing to do with pages.
 *
 * Callers own the surrounding copy: the sheet toasts this as-is, the wizard
 * appends " Live at <slug>.getpropertypro.com." Only the counts are shared,
 * because only the counts were duplicated.
 *
 * The `published: false` case is deliberately NOT here. The two surfaces say
 * different things about it on purpose — the sheet's "The server found nothing
 * left to publish." is a report on a click the PM was invited to make, the
 * wizard's "No changes to publish." is a step's resting state — and folding
 * them together would be sharing a coincidence rather than a rule.
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

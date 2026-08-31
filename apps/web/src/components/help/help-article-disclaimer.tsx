/**
 * The no-legal-advice notice that appears on EVERY help article.
 *
 * ── Why this is a template injection and not article prose ──
 *
 * Only 8 of 66 help articles carried a disclaimer of their own, and the help
 * centre is documentation for a statutory-compliance product: articles explain
 * §718 record categories, notice windows, election procedure and violation
 * process. An article that walks a board through a statutory obligation and
 * carries no notice reads as advice about that obligation.
 *
 * Writing the notice into 66 markdown files would fix today and rot tomorrow —
 * the 67th article ships without it. Injecting it here means no help article
 * can render without it, which is exactly how the public `/resources` pages
 * already work (`ResourceDisclaimer`).
 *
 * The wording escalates when the article cites statutes: naming the specific
 * sections is what makes the notice land rather than read as boilerplate.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-05.
 */

interface HelpArticleDisclaimerProps {
  /** Statute references from the article's frontmatter, e.g. `["718.111(12)"]`. */
  statutes?: string[];
}

export function HelpArticleDisclaimer({ statutes = [] }: HelpArticleDisclaimerProps) {
  const cited = statutes.length > 0;

  return (
    <aside
      // `note`, not `alert` — this is standing context, and a live region would
      // interrupt a screen-reader user on every article they open.
      role="note"
      aria-label="Legal notice"
      className="rounded-2xl border border-edge bg-surface-muted p-4 text-sm leading-6 text-content-secondary"
    >
      <p>
        <strong className="font-semibold text-content">
          This guide explains how to use PropertyPro. It is not legal advice.
        </strong>{' '}
        {cited ? (
          <>
            It refers to {statutes.join(', ')} for context, but statutes change and
            how they apply depends on your association&rsquo;s governing documents
            and circumstances.
          </>
        ) : (
          <>
            Statutes change, and how any requirement applies depends on your
            association&rsquo;s governing documents and circumstances.
          </>
        )}{' '}
        PropertyPro is not a law firm and does not provide legal advice or
        representation. Confirm your association&rsquo;s obligations with its own
        attorney.
      </p>
    </aside>
  );
}

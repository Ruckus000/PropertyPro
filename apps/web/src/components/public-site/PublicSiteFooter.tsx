import { STATUTORY_FOOTER_LINE } from '@/lib/site-editor/site-settings';

interface PublicSiteFooterProps {
  communityName: string;
  /**
   * Website editor v3, Phase 8 — PM-authored fields.
   *
   * All optional so the four existing call sites (three layouts plus the legacy
   * fallback branch) keep compiling, and so a caller that has no branding to
   * hand still renders the pre-Phase-8 footer exactly.
   */
  associationName?: string | null;
  note?: string | null;
  showStatutoryLine?: boolean;
}

/**
 * Public site footer — community name, an optional PM note, an optional
 * statutory records line, "Powered by PropertyPro", and the copyright year.
 *
 * ## The statutory line is opt-in, and its wording is not editable
 *
 * A PM chooses whether `STATUTORY_FOOTER_LINE` appears; they cannot change what
 * it says. That split is deliberate. PropertyPro presents factual data and does
 * not assess compliance adequacy (`.claude/rules/florida-compliance.md`), so a
 * footer line a community could read as the platform certifying its statutory
 * compliance is exactly the claim to avoid — and a free-text field here would
 * let one be written. "Records maintained under" is a statement the association
 * makes about itself. See the gap analysis §5; this is a compliance constraint,
 * not copy polish.
 *
 * ## Everything here is a text child
 *
 * `note` is PM-authored and reaches an unauthenticated page, so it renders as a
 * React text child and nothing else — no `dangerouslySetInnerHTML`, no
 * markdown, no link autodetection. There is deliberately no URL field either: a
 * PM-supplied footer link on a statutory public page is an open-redirect and
 * phishing surface that nothing in the requirement asks for.
 */
export function PublicSiteFooter({
  communityName,
  associationName,
  note,
  showStatutoryLine,
}: PublicSiteFooterProps) {
  const currentYear = new Date().getFullYear();
  // A blank association name falls back rather than rendering "© 2026 ."
  const owner = associationName?.trim() || communityName;
  const noteText = note?.trim();
  // Legal entity names routinely end in a period — "Sunset Condominium
  // Association, Inc." is the common case here, not an edge one — and appending
  // another gives "Inc.. All rights reserved."
  const ownerSentence = owner.endsWith('.') ? owner : `${owner}.`;

  return (
    <footer className="w-full border-t border-edge bg-surface-page px-6 py-12 site-sm:px-8 site-lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 site-md:flex-row site-md:justify-between">
        <div className="max-w-prose space-y-2">
          <div className="font-heading text-xl font-semibold text-content">{communityName}</div>
          {noteText ? <p className="text-base text-content-secondary">{noteText}</p> : null}
          {showStatutoryLine ? (
            <p className="text-sm text-content-secondary">{STATUTORY_FOOTER_LINE}</p>
          ) : null}
        </div>
        <p className="text-sm">
          {/*
            Accessibility statement — NOT opt-in, unlike the statutory line.

            A public association website is the surface an ADA demand letter
            actually targets, and the single most protective thing on it is a
            documented channel for requesting an accommodation: it changes the
            posture of a negotiation from "no response mechanism existed" to "here
            is where you ask and what we commit to". A PM toggle would mean the
            sites most likely to need it are the ones that switch it off.

            Absolute path, not the tenant host: the statement lives on the
            PropertyPro marketing domain because the commitment it describes — the
            five-business-day response — is ours to keep, not the association's.

            See docs/audits/2026-08-09-legal-risk-audit.md F-12.
          */}
          <a
            href="https://getpropertypro.com/legal/accessibility"
            className={FOOTER_LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            Accessibility
          </a>
        </p>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-edge pt-6 text-sm text-content-secondary site-sm:flex-row site-sm:justify-between">
        <span>
          &copy; {currentYear} {ownerSentence} All rights reserved.
        </span>
        <span>
          Powered by{' '}
          <a
            href="https://getpropertypro.com"
            className="font-semibold text-primary underline-offset-4 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            PropertyPro
          </a>
        </span>
      </div>
    </footer>
  );
}

/** A footer link: the theme's primary, with room for a finger. */
const FOOTER_LINK =
  'inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

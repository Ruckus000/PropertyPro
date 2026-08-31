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
    <footer className="w-full border-t border-edge bg-surface-page px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-2 text-sm text-content-tertiary">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            &copy; {currentYear} {ownerSentence} All rights reserved.
          </span>
          <span>
            Powered by{' '}
            <a
              href="https://getpropertypro.com"
              className="text-content-link hover:text-content-link font-medium"
              target="_blank"
              rel="noopener noreferrer"
            >
              PropertyPro
            </a>
          </span>
        </div>

        {noteText ? <p className="text-center sm:text-left">{noteText}</p> : null}

        {showStatutoryLine ? (
          <p className="text-center sm:text-left">{STATUTORY_FOOTER_LINE}</p>
        ) : null}

        {/*
          Accessibility statement — NOT opt-in, unlike the statutory line above.

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
        <p className="text-center sm:text-left">
          <a
            href="https://getpropertypro.com/legal/accessibility"
            className="text-content-link hover:text-content-link font-medium"
            target="_blank"
            rel="noopener noreferrer"
          >
            Accessibility
          </a>
        </p>
      </div>
    </footer>
  );
}

import React from 'react';
import type { LegalDocs } from '@/lib/legal-types';
import { FooterLegalLinks } from './footer-legal-links';

/** Warm marketing footer. Keeps legal links, contact, and the law-firm disclaimer. */
export function MarketingFooter({
  legalDocs,
}: {
  /**
   * Pre-rendered legal HTML for the in-page modal. Intentionally OPTIONAL and
   * passed as a prop (rather than self-fetched) so `MarketingFooter` stays a
   * pure, synchronous component renderable with no props under
   * `renderToStaticMarkup` in tests. Marketing pages supply it via
   * `getLegalDocs()`. When absent (e.g. a page that forgets to pass it, or a
   * no-JS client), the legal links gracefully degrade to plain navigation to
   * `/legal/*` — the modal is a progressive enhancement, never the only path.
   */
  legalDocs?: LegalDocs;
} = {}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-foot-grid">
          <div>
            <div className="mk-logo" style={{ color: '#fff' /* design-tokens:exempt — marketing-theme.css is frozen and already uses bare #fff for footer text (.mk-footer h5, .mk-logo-dot); matches that convention */ }}>
              <span className="mk-logo-dot" aria-hidden="true">
                ◐
              </span>
              PropertyPro
            </div>
            <p style={{ marginTop: 14, maxWidth: '24em', fontSize: 14 }}>
              Compliance and community management for Florida condominium and HOA
              associations — and the property managers who run them.
            </p>
          </div>
          <div>
            <h5>Product</h5>
            <a href="/#features">Features</a>
            <a href="/#compliance">Compliance</a>
            <a href="/#pricing">Pricing</a>
            <a href="/#managers">For managers</a>
          </div>
          <div>
            <h5>Company</h5>
            <a href="/transparency">Community Transparency</a>
            <a href="mailto:support@getpropertypro.com">Contact</a>
          </div>
          <div>
            <h5>Legal</h5>
            <FooterLegalLinks legalDocs={legalDocs} />
          </div>
        </div>
        <div className="mk-foot-bot">
          <span>
            © {year} PropertyPro Florida. PropertyPro is not a law firm and does
            not provide legal advice.
          </span>
          <span>West Palm Beach, FL · support@getpropertypro.com</span>
        </div>
      </div>
    </footer>
  );
}

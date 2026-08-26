import React from 'react';
import type { LegalDocs } from '@/lib/legal-types';
import { FooterLegalLinks } from './footer-legal-links';
import { Logomark } from './marketing-brand';

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
            <p className="mk-logo">
              <Logomark />
              PropertyPro
            </p>
            <p className="mk-foot-blurb">
              Records and compliance for Florida condominium and HOA associations — and
              the managers who run them.
            </p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <a href="/#product">The product</a>
            <a href="/#statute">The statute</a>
            <a href="/#onboarding">Getting started</a>
            <a href="/#portfolio">For managers</a>
            <a href="/#pricing">Pricing</a>
          </nav>
          <nav aria-label="Company">
            <h3>Company</h3>
            <a href="/#who">Who it&apos;s for</a>
            <a href="/resources">Resources</a>
            <a href="/transparency">Community Transparency</a>
            <a href="/contact">Contact</a>
          </nav>
          <nav aria-label="Legal">
            <h3>Legal</h3>
            {/* Real Privacy/Terms wiring — the v6 mockup pointed both at #faq.
                Renders the in-page modal, falling back to /legal/* without JS. */}
            <FooterLegalLinks legalDocs={legalDocs} />
          </nav>
        </div>
        <div className="mk-foot-bot">
          <span>
            © {year} PropertyPro Florida. PropertyPro is not a law firm and does not
            provide legal advice.
          </span>
          <span>West Palm Beach, FL · support@getpropertypro.com</span>
        </div>
      </div>
    </footer>
  );
}

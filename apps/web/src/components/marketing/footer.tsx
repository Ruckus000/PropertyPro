import React from 'react';
import { FooterLegalLinks } from './footer-legal-links';

/** Warm marketing footer. Keeps legal links, contact, and the law-firm disclaimer. */
export function MarketingFooter({
  legalDocs,
}: {
  legalDocs?: { terms: string; privacy: string };
} = {}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-foot-grid">
          <div>
            <div className="mk-logo" style={{ color: '#fff' }}>
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

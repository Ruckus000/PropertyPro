import React from 'react';

/**
 * Marketing footer with company info, legal links, and contact details.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-edge bg-surface-inverse px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Company info */}
          <div className="lg:col-span-1">
            <p className="text-lg font-semibold text-content-inverse">
              PropertyPro<span className="text-content-link"> Florida</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-content-disabled">
              Compliance and community management platform for Florida
              condominium and HOA associations.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-sm font-semibold text-content-inverse">Product</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="#features"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#compliance"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Compliance Info
                </a>
              </li>
              <li>
                <a
                  href="/signup"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Get Started
                </a>
              </li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="text-sm font-semibold text-content-inverse">Legal</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="/legal/terms"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/legal/privacy"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/transparency"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Community Transparency
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-content-inverse">Contact</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="mailto:support@getpropertypro.com"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  support@getpropertypro.com
                </a>
              </li>
              <li>
                <span className="text-sm text-content-disabled">
                  West Palm Beach, FL
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-surface-inverse pt-6">
          <p className="text-center text-xs text-content-tertiary">
            &copy; {new Date().getFullYear()} PropertyPro Florida. All rights
            reserved. PropertyPro is not a law firm and does not provide legal
            advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

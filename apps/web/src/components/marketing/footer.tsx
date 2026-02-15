import React from 'react';

/**
 * Marketing footer with company info, legal links, and contact details.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-900 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Company info */}
          <div className="lg:col-span-1">
            <p className="text-lg font-semibold text-white">
              PropertyPro<span className="text-blue-400"> Florida</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Compliance and community management platform for Florida
              condominium and HOA associations.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Product</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="#features"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#compliance"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Compliance Info
                </a>
              </li>
              <li>
                <a
                  href="/signup"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Get Started
                </a>
              </li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Legal</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="/legal/terms"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/legal/privacy"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Contact</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="mailto:support@propertyprofl.com"
                  className="text-sm text-gray-400 transition-colors hover:text-white"
                >
                  support@propertyprofl.com
                </a>
              </li>
              <li>
                <span className="text-sm text-gray-400">
                  West Palm Beach, FL
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-gray-800 pt-6">
          <p className="text-center text-xs text-gray-500">
            &copy; {new Date().getFullYear()} PropertyPro Florida. All rights
            reserved. PropertyPro is not a law firm and does not provide legal
            advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

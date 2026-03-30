import React from 'react';

/**
 * Pricing section with three tiers for associations and a property manager CTA.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="bg-surface-page px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
            Pricing
          </p>
          <h2 className="mt-2 text-2xl font-bold text-content sm:text-3xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-base text-content-secondary">
            Get compliant in minutes. All plans include Florida statute
            compliance monitoring, document hosting, and SSL certificates.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-md border bg-surface-card p-6 ${
                tier.featured
                  ? 'border-interactive shadow-e2 ring-1 ring-interactive'
                  : 'border-edge'
              }`}
            >
              {tier.featured && (
                <div className="mb-3 inline-flex self-start rounded-md bg-interactive px-2.5 py-1 text-xs font-semibold text-content-inverse">
                  Most Popular
                </div>
              )}
              <h3 className="text-base font-semibold text-content">
                {tier.name}
              </h3>
              <p className="mt-1 text-sm text-content-tertiary">{tier.audience}</p>

              {/* Price */}
              <div className="mt-4">
                {tier.price ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-content">
                      ${tier.price}
                    </span>
                    <span className="text-sm text-content-tertiary">/month</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-content">
                    Contact Us
                  </div>
                )}
              </div>

              {/* Feature list */}
              <ul className="mt-6 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckIcon />
                    <span className="text-sm text-content-secondary">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={tier.ctaHref}
                className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tier.featured
                    ? 'bg-interactive text-content-inverse hover:bg-interactive-hover'
                    : 'border border-edge-strong bg-surface-card text-content-secondary hover:bg-surface-page'
                }`}
              >
                {tier.ctaText}
              </a>
            </div>
          ))}
        </div>

        {/* Additional note */}
        <p className="mt-8 text-center text-sm text-content-tertiary">
          All plans include a 14-day free trial. No credit card required to
          start. Prices shown are per association per month.
        </p>
      </div>
    </section>
  );
}

const tiers: ReadonlyArray<{
  name: string;
  audience: string;
  price: number | null;
  featured: boolean;
  features: string[];
  ctaText: string;
  ctaHref: string;
}> = [
  {
    name: 'Essentials',
    audience: 'Condos & HOAs',
    price: 199,
    featured: false,
    features: [
      'Association website with custom subdomain',
      'Document upload and management',
      'Meeting notice posting with compliance tracking',
      'Owner portal with secure login',
      'Announcement system',
      'Email notifications',
      'Florida statute compliance dashboard',
    ],
    ctaText: 'Start Free Trial',
    ctaHref: '/signup',
  },
  {
    name: 'Professional',
    audience: 'Condos, HOAs & Apartments',
    price: 349,
    featured: true,
    features: [
      'Everything in Essentials',
      'Mobile-optimized resident portal',
      'E-sign document workflows',
      'Maintenance request management',
      'Violation and ARC tracking',
      'Advanced reporting and analytics',
      'Priority email support',
    ],
    ctaText: 'Start Free Trial',
    ctaHref: '/signup',
  },
  {
    name: 'Property Manager',
    audience: 'Management Companies',
    price: null,
    featured: false,
    features: [
      'Multi-association portfolio dashboard',
      'Bulk operations across communities',
      'White-label branding',
      'Centralized compliance reporting',
      'Sub-account management',
      'Volume pricing',
      'Dedicated onboarding specialist',
    ],
    ctaText: 'Contact Sales',
    ctaHref: '/signup?type=pm',
  },
];

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-content-link"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

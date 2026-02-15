import React from 'react';

/**
 * Pricing section with three tiers for associations and a property manager CTA.
 *
 * Tier pricing is placeholder until Stripe products are configured.
 */
export function PricingSection() {
  return (
    <section id="pricing" className="bg-gray-50 px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Pricing
          </p>
          <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-3 text-base text-gray-600">
            Get compliant in minutes. All plans include Florida statute
            compliance monitoring, document hosting, and SSL certificates.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-lg border bg-white p-6 ${
                tier.featured
                  ? 'border-blue-600 shadow-e2 ring-1 ring-blue-600'
                  : 'border-gray-200'
              }`}
            >
              {tier.featured && (
                <div className="mb-3 inline-flex self-start rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Most Popular
                </div>
              )}
              <h3 className="text-base font-semibold text-gray-900">
                {tier.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{tier.audience}</p>

              {/* Price */}
              <div className="mt-4">
                {tier.price ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900">
                      ${tier.price}
                    </span>
                    <span className="text-sm text-gray-500">/month</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-gray-900">
                    Contact Us
                  </div>
                )}
              </div>

              {/* Feature list */}
              <ul className="mt-6 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckIcon />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={tier.ctaHref}
                className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tier.featured
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tier.ctaText}
              </a>
            </div>
          ))}
        </div>

        {/* Additional note */}
        <p className="mt-8 text-center text-sm text-gray-500">
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
    name: 'Compliance Basic',
    audience: 'Condos & HOAs',
    price: 99,
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
    name: 'Compliance + Mobile',
    audience: 'Condos & HOAs',
    price: 199,
    featured: true,
    features: [
      'Everything in Compliance Basic',
      'Native mobile app for residents',
      'Push notifications for announcements',
      'Mobile document viewer',
      'Meeting reminders via push notification',
      'Maintenance request submission',
      'Priority email support',
    ],
    ctaText: 'Start Free Trial',
    ctaHref: '/signup',
  },
  {
    name: 'Full Platform',
    audience: 'Condos, HOAs & Apartments',
    price: 349,
    featured: false,
    features: [
      'Everything in Compliance + Mobile',
      'Apartment operational dashboard',
      'Lease tracking and renewal alerts',
      'CSV resident import',
      'Advanced reporting and analytics',
      'Custom branding',
      'Dedicated account manager',
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
      className="mt-0.5 shrink-0 text-blue-500"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

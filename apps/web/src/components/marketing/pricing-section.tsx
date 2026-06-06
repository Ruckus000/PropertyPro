import React from 'react';

interface Tier {
  name: string;
  price: string;
  unit?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  ribbon?: string;
}

const TIERS: Tier[] = [
  {
    name: 'Essentials',
    price: '$199',
    unit: '/mo',
    blurb: 'Self-managed condos & HOAs getting compliant',
    features: [
      'Branded association website',
      'Document management',
      'Meeting notice tracking',
      'Owner portal',
      'Compliance dashboard',
    ],
    cta: { label: 'Start free trial', href: '/signup' },
  },
  {
    name: 'Professional',
    price: '$349',
    unit: '/mo',
    blurb: 'The full single-community toolkit',
    features: [
      'Everything in Essentials',
      'Mobile resident portal',
      'E-sign workflows',
      'Maintenance & violations',
      'Advanced reporting',
    ],
    cta: { label: 'Start free trial', href: '/signup' },
  },
  {
    name: 'Property Manager',
    price: "Let's talk",
    blurb: 'For management companies running portfolios',
    features: [
      'Multi-association portfolio',
      'Bulk operations across communities',
      'White-label branding',
      'Centralized compliance reporting',
      'Volume pricing & dedicated onboarding',
    ],
    cta: { label: 'Talk to sales', href: 'mailto:support@getpropertypro.com?subject=Portfolio%20sales%20inquiry' },
    featured: true,
    ribbon: 'Recommended for portfolios',
  },
];

/** Pricing — Property Manager tier carries the primary emphasis. */
export function PricingSection() {
  return (
    <section className="mk-band" id="pricing">
      <div className="mk-wrap">
        <div className="mk-sec-head mk-center">
          <span className="mk-eyebrow">Simple pricing</span>
          <h2 className="mk-display">Priced for one building or fifty.</h2>
          <p className="mk-muted" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            Every plan includes statute compliance monitoring, hosting, and SSL.
            14-day free trial, no card required.
          </p>
        </div>
        <div className="mk-price-grid">
          {TIERS.map((t) => (
            <div className={`mk-card mk-price${t.featured ? ' mk-feat' : ''}`} key={t.name}>
              {t.ribbon ? <span className="mk-ribbon">{t.ribbon}</span> : null}
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
              <div className="mk-amt mk-display">
                {t.price}
                {t.unit ? <span>{t.unit}</span> : null}
              </div>
              <p className="mk-muted" style={{ fontSize: 14 }}>
                {t.blurb}
              </p>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a
                href={t.cta.href}
                className={`mk-pill ${t.featured ? 'mk-pill-primary' : 'mk-pill-ghost'}`}
              >
                {t.cta.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

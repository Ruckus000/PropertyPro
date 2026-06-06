import React from 'react';

// Placeholder management-company names — swap for real customers when available.
const COMPANIES = [
  'Gulfstream Management',
  'Coastal Community Group',
  'Sabal Property Partners',
  'Bayshore CAM Co.',
  'Mangrove Association Mgmt',
];

/** Social-proof strip: management companies that run portfolios on PropertyPro. */
export function LogoProofSection() {
  return (
    <section className="mk-band mk-logo-proof">
      <div className="mk-wrap">
        <p className="mk-logo-eyebrow">
          Trusted by management companies across Florida
        </p>
        <div className="mk-logo-strip">
          {COMPANIES.map((c) => (
            <div key={c} className="mk-display mk-logo-name">
              {c}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

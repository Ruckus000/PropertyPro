import React from 'react';

// Placeholder management-company names — swap for real customers when available.
const COMPANIES = [
  'Gulfstream Management',
  'Coastal Community Group',
  'Sabal Property Partners',
  'Bayshore CAM Co.',
  'Mangrove Association Mgmt',
];

/** Placeholder management-company strip. */
export function LogoProofSection() {
  return (
    <section className="mk-band mk-logo-proof">
      <div className="mk-wrap">
        <p className="mk-logo-eyebrow">
          Illustrative management-company names (examples)
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

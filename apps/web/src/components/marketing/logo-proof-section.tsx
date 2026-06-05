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
    <section className="mk-band" style={{ paddingTop: 22, paddingBottom: 6 }}>
      <div className="mk-wrap">
        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-soft)',
            marginBottom: 18,
          }}
        >
          Trusted by management companies across Florida
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 30,
            flexWrap: 'wrap',
            alignItems: 'center',
            opacity: 0.72,
            maxWidth: 1040,
            margin: '0 auto',
          }}
        >
          {COMPANIES.map((c) => (
            <div key={c} className="mk-display" style={{ fontSize: 19 }}>
              {c}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

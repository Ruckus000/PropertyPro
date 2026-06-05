import React from 'react';

const COMMUNITIES = [
  { name: 'Sunset Condos', score: 92, ring: '#2f8f83' },
  { name: 'Palm Shores HOA', score: 88, ring: '#2f8f83' },
  { name: 'Bayfront Towers', score: 74, ring: '#e3a93c' },
];

/**
 * Hero/features product UI: a property manager's multi-association portfolio,
 * each community with its own compliance score plus an aggregate. Static demo
 * data — illustrative only.
 */
export function PortfolioCard() {
  return (
    <div className="mk-device">
      <div className="mk-device-top">
        <i style={{ background: '#f6b4a4' }} />
        <i style={{ background: '#f3d488' }} />
        <i style={{ background: '#9fd8cf' }} />
        <span
          style={{
            marginLeft: 10,
            fontSize: 12,
            color: 'var(--mk-ink-soft)',
            fontWeight: 600,
          }}
        >
          app.getpropertypro.com/portfolio
        </span>
      </div>
      <div className="mk-device-body">
        <div className="mk-portfolio-head">
          <div>
            <div style={{ fontSize: 13, color: 'var(--mk-ink-soft)' }}>
              Portfolio compliance
            </div>
            <div className="mk-portfolio-score mk-display">86% on track</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--mk-teal)',
              background: '#e7f4f1',
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            12 communities
          </span>
        </div>
        {COMMUNITIES.map((c) => (
          <div className="mk-row" key={c.name}>
            <span className="mk-ic" aria-hidden="true">
              🏢
            </span>
            <span className="mk-nm">{c.name}</span>
            <span
              className="mk-mini-ring"
              style={{
                background: `conic-gradient(${c.ring} 0 ${c.score}%, #ece1d4 ${c.score}% 100%)`,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {c.score}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

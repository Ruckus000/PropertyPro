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
        <i className="mk-tl-coral" />
        <i className="mk-tl-gold" />
        <i className="mk-tl-teal" />
        <span className="mk-url">app.getpropertypro.com/portfolio</span>
      </div>
      <div className="mk-device-body">
        <div className="mk-portfolio-head">
          <div>
            <div className="mk-portfolio-label">Portfolio compliance</div>
            <div className="mk-portfolio-score mk-display">86% on track</div>
          </div>
          <span className="mk-portfolio-pill">12 communities</span>
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
              <span className="mk-mini-dot">{c.score}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

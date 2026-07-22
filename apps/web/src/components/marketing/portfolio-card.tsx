import React from 'react';

// ring colors reference the marketing palette custom properties directly
// (marketing-theme.css is frozen / out of drain scope) rather than raw hex —
// var(--mk-teal) / var(--mk-gold) match the same accent colors used by the
// mk-tl-teal / mk-tl-gold "traffic light" dots elsewhere in this component.
const COMMUNITIES = [
  { name: 'Sunset Condos', score: 92, ring: 'var(--mk-teal)' },
  { name: 'Palm Shores HOA', score: 88, ring: 'var(--mk-teal)' },
  { name: 'Bayfront Towers', score: 74, ring: 'var(--mk-gold)' },
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
                // track color is the marketing palette's --mk-line (frozen CSS var)
                background: `conic-gradient(${c.ring} 0 ${c.score}%, var(--mk-line) ${c.score}% 100%)`,
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

import React from 'react';
import { PortfolioCard } from './portfolio-card';

/**
 * Hero — property-manager-first. Leads with the portfolio value prop, shows the
 * portfolio product card, and welcomes self-managed boards as a secondary line.
 */
export function HeroSection() {
  return (
    <section className="mk-hero" id="top">
      <div className="mk-sun" aria-hidden="true" />
      <div className="mk-wrap mk-hero-grid">
        <div>
          <span className="mk-badge">
            <span className="mk-pulse" aria-hidden="true" /> Built for Florida
            condos &amp; HOAs
          </span>
          <h1 className="mk-display mk-h1">
            Run your whole portfolio
            <br />
            compliant by <span className="mk-swash">2026.</span>
          </h1>
          <p className="mk-lede mk-muted">
            Florida law now requires every association you manage to post
            records, notices, and budgets online. PropertyPro keeps your entire
            book of business compliant by default — from one dashboard, across
            every community.
          </p>
          <div className="mk-hero-cta">
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get your portfolio online →
            </a>
            <a href="#how" className="mk-pill mk-pill-ghost">
              ▶ See a 2-min tour
            </a>
          </div>
          <p className="mk-hero-sub">
            Run a single building?{' '}
            <a
              href="#pricing"
              style={{ color: 'var(--mk-coral-d)', fontWeight: 600 }}
            >
              Self-managed boards are covered too →
            </a>
          </p>
          <div className="mk-trust">
            <span>
              <i className="mk-check">✓</i> Onboard a community in minutes
            </span>
            <span>
              <i className="mk-check">✓</i> 14-day free trial
            </span>
            <span>
              <i className="mk-check">✓</i> No setup fees
            </span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <PortfolioCard />
          <div className="mk-float">
            <span className="mk-av" aria-hidden="true" />
            <div className="mk-t">
              <b>12 communities</b>
              <br />
              <span className="mk-muted">compliant this quarter</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import React from 'react';
import { PortfolioCard } from './portfolio-card';

const FEATURES = [
  { icon: '📁', title: 'Document management', body: 'Upload, organize, and publish records with automatic compliance tracking.' },
  { icon: '🔔', title: 'Meeting notices', body: '48-hour and 14-day notices posted with the right timing, every time.' },
  { icon: '👤', title: 'Owner portal', body: 'Secure logins for owners to read documents, notices, and submit requests.' },
  { icon: '📱', title: 'Mobile access', body: 'A mobile-first portal with email reminders for residents and board members.' },
  { icon: '📣', title: 'Announcements', body: 'Reach every owner instantly — no more taped flyers in the elevator.' },
  { icon: '✅', title: 'Compliance dashboard', body: 'Per-community statutory tracking that rolls up into one portfolio score.' },
];

/**
 * Features — portfolio compliance is the hero feature (with the portfolio card),
 * supported by a grid of per-association tools. The #managers anchor lands here.
 */
export function FeaturesSection() {
  return (
    <section className="mk-band" id="features">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">Built for portfolios</span>
          <h2 className="mk-display">A whole back office, minus the binders.</h2>
        </div>

        <div className="mk-card mk-feat-hero" id="managers">
          <div className="mk-copy">
            <span className="mk-eyebrow">For property managers</span>
            <h3 className="mk-display">Portfolio compliance, one view.</h3>
            <p className="mk-muted">
              Every association you manage, every statutory deadline, one rolled-up
              score. Bulk-post documents, push white-label branding, and see the
              one community that needs attention — without logging into twelve
              sites.
            </p>
            <a href="/signup" className="mk-pill mk-pill-ghost" style={{ marginTop: 18 }}>
              Explore the portfolio dashboard →
            </a>
          </div>
          <div className="mk-art">
            <PortfolioCard />
          </div>
        </div>

        <div className="mk-feat-grid">
          {FEATURES.map((f) => (
            <div className="mk-card mk-fcard" key={f.title}>
              <div className="mk-fic" aria-hidden="true">
                {f.icon}
              </div>
              <h4>{f.title}</h4>
              <p className="mk-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

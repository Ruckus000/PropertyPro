import React from 'react';
import { PinBadIcon, PinOkIcon, PinWarnIcon, SectionMark, SurfaceBar } from './marketing-brand';

const COMMUNITIES = [
  {
    name: 'Bayfront Towers',
    meta: 'Pinellas · §718 · 196 units',
    status: '4 late · 74%',
    tone: 'bad' as const,
  },
  {
    name: 'Sunset Palms',
    meta: 'Miami-Dade · §718 · 124 units',
    status: '2 late · 81%',
    tone: 'bad' as const,
  },
  {
    name: 'Coral Ridge HOA',
    meta: 'Palm Beach · §720 · 246 parcels',
    status: '1 due · 91%',
    tone: 'warn' as const,
  },
  {
    name: 'Palm Shores HOA',
    meta: 'Broward · §720 · 312 parcels',
    status: 'On track · 94%',
    tone: 'ok' as const,
  },
];

function PinIcon({ tone }: { tone: 'ok' | 'bad' | 'warn' }) {
  if (tone === 'ok') return <PinOkIcon />;
  if (tone === 'bad') return <PinBadIcon />;
  return <PinWarnIcon />;
}

export function PortfolioSection() {
  return (
    <section className="mk-band" id="portfolio" aria-labelledby="pf-h">
      <div className="mk-wrap">
        <div className="mk-pitem">
          <div>
            <SectionMark index="06" label="For managers & CAMs" />
            <h2 className="mk-display mk-pf-h" id="pf-h">
              Twelve associations, one list of what&apos;s late.
            </h2>
            <p className="mk-muted mk-pf-lede">
              The law treats every association separately, which is why the work
              multiplies. A roll-up shows the one community that needs a call this
              morning — not twelve logins and a spreadsheet.
            </p>
            <div className="mk-hero-cta mk-pf-cta">
              <a className="mk-pill mk-pill-ghost" href="/contact">
                Talk to us about a portfolio
              </a>
            </div>
          </div>
          <div>
            <div
              className="mk-surface"
              role="img"
              aria-label="Portfolio view across twelve communities, 86 percent on track overall: Bayfront Towers at 74 percent with four items late, Sunset Palms at 81 percent with two late, Coral Ridge HOA at 91 percent with one due, and Palm Shores HOA on track at 94 percent."
            >
              <SurfaceBar url="app.getpropertypro.com/portfolio" />
              <div className="mk-sbody">
                <div className="mk-shead">
                  <div>
                    <p className="mk-shead-title">Portfolio</p>
                    <p className="mk-shead-sub">12 communities · 2,486 units</p>
                  </div>
                  <p className="mk-sscore">
                    86<span>% on track</span>
                  </p>
                </div>
                {COMMUNITIES.map((c, i) => (
                  <div className={i === 0 ? 'mk-srow mk-at' : 'mk-srow'} key={c.name}>
                    <div>
                      <b>{c.name}</b>
                      <small>{c.meta}</small>
                    </div>
                    <span className={`mk-pin mk-pin-${c.tone}`}>
                      <PinIcon tone={c.tone} />
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

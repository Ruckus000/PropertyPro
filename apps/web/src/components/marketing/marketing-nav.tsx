import React from 'react';

const NAV_LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#compliance', label: 'Compliance' },
  { href: '#how', label: 'How it works' },
  { href: '#managers', label: 'For managers' },
  { href: '#pricing', label: 'Pricing' },
];

/** Sticky marketing nav with in-page smooth-scroll anchors. */
export function MarketingNav() {
  return (
    <nav className="mk-nav">
      <div className="mk-wrap mk-nav-in">
        <a href="#top" className="mk-logo">
          <span className="mk-logo-dot" aria-hidden="true">
            ◐
          </span>
          PropertyPro
        </a>
        <div className="mk-nav-links">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="mk-nav-right">
          <a href="/auth/login">Log in</a>
          <a
            href="/signup"
            className="mk-pill mk-pill-primary"
            style={{ padding: '10px 20px' }}
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';

const NAV_LINKS = [
  { href: '/#features', label: 'Product' },
  { href: '/#compliance', label: 'Compliance' },
  { href: '/#how', label: 'How it works' },
  { href: '/#managers', label: 'For managers' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/resources', label: 'Resources' },
];

/** Sticky marketing nav with in-page smooth-scroll anchors and a mobile menu. */
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and return focus to the toggle.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Auto-close when the viewport grows back to the desktop breakpoint so the
  // panel can't get stuck open behind the restored desktop nav.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(min-width: 880px)');
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) setOpen(false);
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <nav className="mk-nav">
      <div className="mk-wrap mk-nav-in">
        <a href="/" className="mk-logo">
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
        <button
          ref={toggleRef}
          type="button"
          className="mk-nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mk-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>
      </div>
      {open && (
        <nav
          id="mk-mobile-menu"
          className="mk-mobile-menu"
          aria-label="Mobile"
          onClick={(e) => {
            // Close when any link inside the panel is activated.
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          <div className="mk-wrap mk-mobile-menu-in">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
            <a href="/auth/login">Log in</a>
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get started
            </a>
          </div>
        </nav>
      )}
    </nav>
  );
}

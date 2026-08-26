'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Logomark } from './marketing-brand';

const NAV_LINKS = [
  { href: '/#statute', label: 'The statute' },
  { href: '/#product', label: 'The product' },
  { href: '/#portfolio', label: 'For managers' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'Questions' },
];

/** The section ids the scroll-spy tracks, in document order. */
const SPY_IDS = NAV_LINKS.map((l) => l.href.replace('/#', ''));

/**
 * Sticky marketing nav: in-page anchors, a mobile menu, and a scroll-spy that
 * marks the section currently in view with `aria-current`.
 */
export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
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

  // Auto-close when the viewport grows back past the mobile breakpoint so the
  // panel can't get stuck open behind the restored desktop nav. 1041px matches
  // the `max-width:1040px` rule that hides `.mk-nav-links`.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(min-width: 1041px)');
    function onChange(e: MediaQueryListEvent) {
      if (e.matches) setOpen(false);
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Shadow once the page has scrolled off the top.
  useEffect(() => {
    function onScroll() {
      setStuck(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy. The rootMargin collapses the viewport to a band around the
  // middle, so "in view" means "the reader is looking at it", not "it is
  // technically on screen".
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observed = SPY_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (observed.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    observed.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <header className={stuck ? 'mk-nav mk-stuck' : 'mk-nav'}>
      <nav className="mk-wrap mk-nav-in" aria-label="Primary">
        <a className="mk-logo" href="/#top">
          <Logomark />
          PropertyPro
        </a>
        <div className="mk-nav-links">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={current === l.href.replace('/#', '') ? 'true' : undefined}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="mk-nav-right">
          <a href="/auth/login">Log in</a>
          <a className="mk-pill mk-pill-primary mk-pill-sm" href="/signup">
            Start a trial
          </a>
        </div>
        <button
          ref={toggleRef}
          type="button"
          className="mk-nav-toggle"
          aria-expanded={open}
          aria-controls="mk-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? '✕' : '☰'}</span> Menu
        </button>
      </nav>
      {open && (
        <nav
          id="mk-mobile-menu"
          className="mk-mobile-menu"
          aria-label="Mobile"
          onClick={(e) => {
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
            <a className="mk-pill mk-pill-primary" href="/signup">
              Start a trial
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}

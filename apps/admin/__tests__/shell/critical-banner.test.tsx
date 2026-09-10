// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { CriticalBanner } from '@/components/shell/CriticalBanner';

const critical = { fingerprint: 'stripe-webhook:2026-09-08T06', text: 'Stripe webhook handler failing since 06:40 — 14 errors/hr, 3 invoices unsynced.', shortText: 'Stripe webhook failing · 14 errors/hr', href: '/health' };
const DISMISSED_KEY = 'ppro-admin-critical-dismissed';

describe('CriticalBanner', () => {
  beforeEach(() => sessionStorage.clear());
  it('renders the alert with a View link and dismisses per fingerprint', () => {
    const { rerender } = render(<CriticalBanner critical={critical} mobile={false} />);
    expect(screen.getByRole('alert').textContent).toContain('14 errors/hr');
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/health');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<CriticalBanner critical={{ ...critical, fingerprint: 'other' }} mobile={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('uses the short text on mobile', () => {
    render(<CriticalBanner critical={critical} mobile />);
    expect(screen.getByRole('alert').textContent).toContain('Stripe webhook failing');
  });
  it('renders nothing when critical is null', () => {
    const { container } = render(<CriticalBanner critical={null} mobile={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  // Finding 3 (review): `dismissed` used to be seeded via
  // `useState(() => readDismissed())`. That initializer runs during the
  // CLIENT's hydration render, where `window`/`sessionStorage` already exist
  // — exactly as they do in this jsdom test, and unlike the real server pass,
  // which `(console)/layout.tsx` performs with no `window` at all and so
  // always produces the banner. A previously-dismissed fingerprint sitting in
  // `sessionStorage` made that first client render return `null` while the
  // server-rendered HTML still had the banner in it: a hydration mismatch.
  // `renderToStaticMarkup` never runs effects, so this asserts the render
  // body itself does not consult storage — mirroring what
  // `admin-rail.test.tsx`'s "renders the collapsed rail on the server" test
  // asserts about `AdminRail`'s `canHover` seed.
  it('renders the banner on a fresh render even when sessionStorage already has this fingerprint dismissed', () => {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([critical.fingerprint]));
    const markup = renderToStaticMarkup(<CriticalBanner critical={critical} mobile={false} />);
    expect(markup).toContain('role="alert"');
  });
});

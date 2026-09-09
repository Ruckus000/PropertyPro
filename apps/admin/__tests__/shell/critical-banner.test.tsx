// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CriticalBanner } from '@/components/shell/CriticalBanner';

const critical = { fingerprint: 'stripe-webhook:2026-09-08T06', text: 'Stripe webhook handler failing since 06:40 — 14 errors/hr, 3 invoices unsynced.', shortText: 'Stripe webhook failing · 14 errors/hr', href: '/health' };

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
});

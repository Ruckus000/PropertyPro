// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KpiCard } from '../kpi-card';

describe('KpiCard', () => {
  it('renders as a button when onClick is given without href', () => {
    const onClick = vi.fn();
    render(<KpiCard title="Open threads" value={7} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /open threads/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('uses the injected link component for href', () => {
    const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a data-testid="custom-link" href={href}>{children}</a>
    );
    render(<KpiCard title="MRR" value="$1" href="/billing" linkComponent={Link} />);
    expect(screen.getByTestId('custom-link').getAttribute('href')).toBe('/billing');
  });
  it('shows the delta with a custom label, never colour alone', () => {
    render(<KpiCard title="Past due" value="$240" delta={12} trend="up" invertTrend deltaLabel="vs. 30d" />);
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText('vs. 30d')).toBeTruthy();
  });
});

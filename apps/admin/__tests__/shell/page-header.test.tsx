// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';

describe('AdminPageHeader', () => {
  it('paints the title as the page h1 in the display face', () => {
    render(<AdminPageHeader title="Overview" description="Good morning" actions={<button>New ticket</button>} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Overview' });
    expect(h1.className).toContain('font-display');
    expect(screen.getByText('Good morning')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New ticket' })).toBeTruthy();
  });
  it('renders a back link when backHref is given', () => {
    render(<AdminPageHeader title="Bayview" backHref="/clients" backLabel="Clients" />);
    expect(screen.getByRole('link', { name: /clients/i }).getAttribute('href')).toBe('/clients');
  });
});

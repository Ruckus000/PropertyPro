import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickFilterTabs } from '../quick-filter-tabs';

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
];

describe('QuickFilterTabs tone', () => {
  it('paints the active tab brand-coloured by default, unchanged', () => {
    render(<QuickFilterTabs tabs={tabs} active="all" onChange={() => {}} />);
    const active = screen.getByRole('button', { name: 'All' });
    expect(active).toHaveClass('bg-interactive', 'text-content-inverse', 'shadow-sm');
    expect(active).toHaveAttribute('aria-pressed', 'true');
  });
  it('paints the active tab in ink with tone="ink", with no interactive class', () => {
    render(<QuickFilterTabs tabs={tabs} active="all" onChange={() => {}} tone="ink" />);
    const active = screen.getByRole('button', { name: 'All' });
    expect(active).toHaveClass('bg-surface-inverse', 'text-content-inverse');
    expect(active.className).not.toContain('interactive');
    expect(screen.getByRole('button', { name: 'Open' }).className).not.toContain('interactive');
  });
});

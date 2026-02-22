import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { CompactCard } from '../../src/components/mobile/CompactCard';

describe('CompactCard', () => {
  it('renders title', () => {
    render(<CompactCard title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<CompactCard title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('renders meta when provided', () => {
    render(<CompactCard title="Title" meta="1/1/2026" />);
    expect(screen.getByText('1/1/2026')).toBeInTheDocument();
  });

  it('omits subtitle and meta when not provided', () => {
    render(<CompactCard title="Only title" />);
    expect(screen.queryByText(/subtitle/i)).not.toBeInTheDocument();
  });

  it('renders as an anchor tag when href provided', () => {
    render(<CompactCard title="Clickable" href="/mobile/documents/1?communityId=5" />);
    const link = screen.getByRole('link', { name: /clickable/i });
    expect(link).toHaveAttribute('href', '/mobile/documents/1?communityId=5');
  });

  it('renders as a div when no href provided', () => {
    const { container } = render(<CompactCard title="Static card" />);
    const div = container.querySelector('div.mobile-card');
    expect(div).toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
  });
});

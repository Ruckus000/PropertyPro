// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inbox } from 'lucide-react';
import { EmptyState } from '../empty-state';

describe('EmptyState (props-only)', () => {
  it('renders title, description and action', () => {
    render(<EmptyState icon={Inbox} title="Nothing here" description="No open threads." action={<button>Refresh</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeTruthy();
    expect(screen.getByText('No open threads.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });
  it('renders the given icon', () => {
    // lucide icons render an <svg>; their internal class names (e.g. "lucide-inbox")
    // aren't a stable public contract, so scope the query to this render's
    // container and match on the decorative-icon markup the component itself
    // owns (an <svg aria-hidden="true">) rather than lucide's className.
    const { container } = render(<EmptyState icon={Inbox} title="Nothing here" />);
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeTruthy();
    expect(icon?.tagName.toLowerCase()).toBe('svg');
  });
  it('renders no icon when none is provided', () => {
    const { container } = render(<EmptyState title="Nothing here" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

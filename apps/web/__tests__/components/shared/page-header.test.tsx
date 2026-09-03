/**
 * PageHeader — toolbar-only chrome with a visually-hidden title.
 *
 * A design decision transferred from the PropertyPro prototype ("no page
 * titles or descriptions — the rail already says which page you are on"):
 * the h1 is kept for the breadcrumb leaf and assistive tech but not painted,
 * the description is not painted at all, and what remains is a toolbar — any
 * left-slot content, then the actions and Help at the right edge. When nothing
 * would paint, nothing paints: no empty band above the content.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Help is unavailable here — no provider, flag unset — which is also the state
// production ships in today. The toolbar must not reserve space for it.
vi.mock('@/components/help/help-widget-provider', () => ({
  useHelpWidgetOptional: () => null,
}));

import { PageHeader } from '@/components/shared/page-header';

describe('PageHeader', () => {
  it('keeps the title as an h1 for the breadcrumb leaf and screen readers, but does not paint it', () => {
    render(<PageHeader title="Q3 Board Minutes" />);

    const h1 = screen.getByRole('heading', { level: 1, name: 'Q3 Board Minutes' });
    expect(h1).toHaveClass('sr-only');
    // Exactly what shell-breadcrumbs.tsx reads for the leaf label.
    expect(document.querySelector('[data-page-header] h1')?.textContent).toBe('Q3 Board Minutes');
  });

  it('does not paint the description', () => {
    render(<PageHeader title="Documents" description="Every record the statute requires." />);

    expect(screen.queryByText('Every record the statute requires.')).not.toBeInTheDocument();
  });

  it('renders the actions in the toolbar', () => {
    render(<PageHeader title="Documents" actions={<button type="button">Upload Document</button>} />);

    expect(screen.getByRole('button', { name: 'Upload Document' })).toBeInTheDocument();
  });

  it('renders left-slot children in the toolbar', () => {
    render(
      <PageHeader title="Documents">
        <span>Filters</span>
      </PageHeader>,
    );

    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('paints nothing when there is nothing to show but the title', () => {
    const { container } = render(<PageHeader title="Documents" />);

    const header = container.querySelector('[data-page-header]');
    expect(header).not.toBeNull();
    // Only the hidden h1 — no toolbar row, so no band above the content.
    expect(header!.children).toHaveLength(1);
    expect(header!.firstElementChild?.tagName).toBe('H1');
  });
});

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

describe('EmptyState scene sizes (empty-state pattern)', () => {
  const Art = () => <svg data-testid="art" aria-hidden="true" />;

  it('hero: a region named by its h2, with eyebrow, body, action, art and aside', () => {
    render(
      <EmptyState
        size="hero"
        eyebrow="Documents"
        title="Your association's documents will appear here"
        description="You'll get an email when one is posted."
        illustration={<Art />}
        action={<button>Report damage</button>}
        aside={<section aria-label="Help">Help links</section>}
      />,
    );
    const heading = screen.getByRole('heading', { level: 2, name: "Your association's documents will appear here" });
    const region = screen.getByRole('region', { name: "Your association's documents will appear here" });
    expect(region.contains(heading)).toBe(true);
    expect(screen.getByText('Documents').tagName).toBe('P');
    expect(screen.getByText("You'll get an email when one is posted.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report damage' })).toBeTruthy();
    expect(screen.getByTestId('art')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Help' })).toBeTruthy();
  });

  it('splits into scene and context columns only when there is an aside', () => {
    const columns = (c: HTMLElement) => c.querySelector('section > div')?.className ?? '';
    // Matched without its container variant prefix: a test file naming that
    // variant would count as a container-query consumer in container-queries.test.ts.
    expect(columns(render(<EmptyState size="hero" title="T" />).container)).not.toContain('grid-cols-12');
    expect(columns(render(<EmptyState size="hero" title="T" aside={<p>ctx</p>} />).container)).toContain(
      'grid-cols-12',
    );
  });

  it('is always named by its own h2, even if a caller passes aria-labelledby', () => {
    render(<EmptyState size="hero" title="Own title" aria-labelledby="elsewhere" />);
    expect(screen.getByRole('region', { name: 'Own title' })).toBeTruthy();
  });

  it('section: an h3, no region', () => {
    render(<EmptyState size="section" title="No meeting minutes yet" illustration={<Art />} />);
    expect(screen.getByRole('heading', { level: 3, name: 'No meeting minutes yet' })).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('compact: one line, no heading', () => {
    render(<EmptyState size="compact" title="Nothing needs a signature" illustration={<Art />} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Nothing needs a signature').tagName).toBe('P');
  });

  it('keeps the sm/md/lg markup apps/admin renders byte-identical', () => {
    // apps/admin passes these sizes directly (20 files). Pin the exact classes
    // so the scene work cannot restyle the operator console by accident.
    const { container } = render(<EmptyState icon={Inbox} title="Nothing here" description="d" size="md" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe('flex flex-col items-center text-center py-10 px-6');
    expect(root.querySelector('div')?.className).toBe(
      'mb-4 flex items-center justify-center rounded-full bg-surface-muted h-[72px] w-[72px]',
    );
    expect(screen.getByRole('heading', { level: 3 }).className).toBe('text-content text-lg font-semibold');
    expect(screen.getByText('d').className).toBe('text-content-tertiary text-sm max-w-[320px]');
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Section, SectionError, SectionFirstRun, SectionFooter, SectionHeader, SectionToolbar } from '../section';

describe('Section kit', () => {
  it('titles a section with an h2', () => {
    render(<Section><SectionHeader title="Sent alerts" description="Newest first" /></Section>);
    expect(screen.getByRole('heading', { level: 2, name: 'Sent alerts' })).toBeVisible();
    expect(screen.getByText('Newest first')).toBeVisible();
  });
  it('shows bulk actions in place of filters when something is selected', () => {
    render(<SectionToolbar filters={<span>All</span>} search={<input aria-label="Search" />} bulk={<button>Export 3</button>} />);
    expect(screen.queryByText('All')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export 3' })).toBeVisible();
    expect(screen.getByLabelText('Search')).toBeVisible();
  });
  it('lets filters scroll rather than wrap', () => {
    const { container } = render(<SectionToolbar filters={<span>All</span>} />);
    expect(container.querySelector('[data-filters]')).toHaveClass('overflow-x-auto');
  });
  it('drops its box when bare', () => {
    const { container } = render(<Section bare>cards</Section>);
    expect(container.firstChild).not.toHaveClass('border');
    const boxed = render(<Section>cards</Section>);
    expect(boxed.container.firstChild).toHaveClass('border');
  });
  it('puts the note left and actions right in a footer', () => {
    render(<SectionFooter note="Showing 4"><button>Load more</button></SectionFooter>);
    expect(screen.getByText('Showing 4')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible();
  });
  it('labels a first-run example and hides it from assistive tech', () => {
    render(<SectionFirstRun title="No packages logged yet" description="Log the first delivery." example={<p>FedEx box</p>} exampleLabel="Example of a logged package" />);
    expect(screen.getByRole('heading', { level: 3, name: 'No packages logged yet' })).toBeVisible();
    expect(screen.getByText('Example of a logged package')).toBeVisible();
    expect(screen.getByText('FedEx box').closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('announces an error and retries', () => {
    const onRetry = vi.fn();
    render(<SectionError message="We couldn't load packages." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load packages.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

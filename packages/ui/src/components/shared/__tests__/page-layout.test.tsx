import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLayout, useInPageLayout } from '../page-layout';
import type { AccessSentence } from '../side-panel';

// These tests assert class strings only; the real `cq` container is the layout's own root.
const about = (s: string) => s as AccessSentence;

function Probe() { return <span>{useInPageLayout() ? 'in' : 'out'}</span>; }

describe('PageLayout trail placement', () => {
  const aside = (c: HTMLElement) => c.querySelector('[data-page-grid] > div:last-child') as HTMLElement;
  it('moves a trail-only aside to row 1', () => {
    const { container } = render(<PageLayout template="list" header={null} panel={{ template: 'list', shortcuts: 's' }}>x</PageLayout>);
    expect(aside(container).className).toContain('row-start-1');
    expect(aside(container).className).not.toContain('row-start-2');
  });
  it('keeps the trail in row 2 under a lead', () => {
    const { container } = render(<PageLayout template="list" header={null} panel={{ template: 'list', glance: 'g', shortcuts: 's' }}>x</PageLayout>);
    expect(aside(container).className).toContain('row-start-2');
  });
});

describe('PageLayout', () => {
  it('keeps summary, main, more in reading order', () => {
    const { container } = render(
      <PageLayout template="list" header={<h1>Packages</h1>} panel={{ template: 'list', glance: 'g', shortcuts: 's' }}><div data-testid="main">rows</div></PageLayout>,
    );
    const order = [...container.querySelectorAll('aside, [data-testid="main"]')].map((e) => e.getAttribute('aria-label') ?? 'main');
    expect(order).toEqual(['Summary', 'main', 'More about this page']);
  });
  it('holds the panel back to a wider box on table pages', () => {
    const { container, rerender } = render(<PageLayout template="list" records="rows" header={null} panel={{ template: 'list', glance: 'g' }}>x</PageLayout>);
    expect(container.querySelector('[data-page-grid]')!.className).toMatch(/cq-lg:grid-cols/);
    rerender(<PageLayout template="list" records="table" header={null} panel={{ template: 'list', glance: 'g' }}>x</PageLayout>);
    const cls = container.querySelector('[data-page-grid]')!.className;
    expect(cls).toMatch(/cq-xl:grid-cols/);
    expect(cls).not.toMatch(/cq-lg:grid-cols/);
  });
  it('never reorders with CSS', () => {
    const { container } = render(<PageLayout template="list" header={null} panel={{ template: 'list', glance: 'g', about: about('a') }}>x</PageLayout>);
    expect(container.innerHTML).not.toMatch(/\border-(first|last|\d)/);
  });
  it('folds an About-only panel into a line under the header', () => {
    const { container } = render(<PageLayout template="list" header={<h1>Forum</h1>} panel={{ template: 'list', about: about('Anyone on the board can post.') }}>x</PageLayout>);
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByText('Anyone on the board can post.')).toBeVisible();
  });
  it('tells descendants they are inside a layout', () => {
    render(<><Probe /><PageLayout template="list" header={<Probe />}>x</PageLayout></>);
    expect(screen.getAllByText(/in|out/).map((e) => e.textContent)).toEqual(['out', 'in']);
  });
});

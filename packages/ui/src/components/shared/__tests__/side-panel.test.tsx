import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type AccessSentence, isPanelWorthDrawing, PanelAttention, PanelGlance, panelRegions } from '../side-panel';

const about = (s: string) => s as AccessSentence; // tests only; pages get one from describeAccess

describe('SidePanel', () => {
  it('orders positions regardless of how props are written', () => {
    const r = panelRegions({ template: 'list', about: about('a'), shortcuts: 's', attention: 'n', glance: 'g' });
    expect(r.lead.map((x) => x.heading)).toEqual(['At a glance', 'Needs attention']);
    expect(r.trail.map((x) => x.heading)).toEqual(['Shortcuts', 'About']);
  });
  it('renames positions per template', () => {
    const r = panelRegions({ template: 'detail', details: 'd', related: 'r' });
    expect([...r.lead, ...r.trail].map((x) => x.heading)).toEqual(['Details', 'Related']);
  });
  it('is not worth drawing with only About', () => {
    expect(isPanelWorthDrawing({ template: 'list', about: about('Managers can send alerts.') })).toBe(false);
    expect(isPanelWorthDrawing({ template: 'list', glance: 'g' })).toBe(true);
    expect(isPanelWorthDrawing({ template: 'list' })).toBe(false);
  });
  it('rejects a position that belongs to another template', () => {
    // @ts-expect-error a detail panel has no shortcuts
    panelRegions({ template: 'detail', shortcuts: 's' });
  });
  it('refuses a hand-written About sentence', () => {
    // @ts-expect-error About comes from describeAccess, not from a string literal
    panelRegions({ template: 'list', about: 'Managers can send alerts.' });
  });
  it('names where a figure comes from', () => {
    const { container } = render(<PanelGlance figure="7" unit="awaiting pickup" source="usePackages" />);
    expect(container.firstChild).toHaveAttribute('data-source', 'usePackages');
    expect(screen.getByText('7')).toBeVisible();
  });
  it('puts every line value in one grid column', () => {
    const { container } = render(
      <PanelGlance figure="7" unit="x" source="s" lines={[['Picked up', '3'], ['Overdue by a long label', '1']]} />,
    );
    const dl = container.querySelector('dl')!;
    expect(dl).toHaveClass('grid', 'grid-cols-[auto_1fr]');
    expect(Array.from(dl.children).map((c) => c.tagName)).toEqual(['DT', 'DD', 'DT', 'DD']);
  });
  it('gives attention an icon and a leading word, or a quiet none', () => {
    const { rerender, container } = render(<PanelAttention lead="Deadline" title="2 records are due this week" />);
    expect(screen.getByText('Deadline:')).toBeVisible();
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<PanelAttention none="Nothing needs attention." />);
    expect(screen.getByText('Nothing needs attention.')).toBeVisible();
  });
});

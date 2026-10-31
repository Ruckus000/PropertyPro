import { describe, expect, it } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PricingPlanSwitcher } from '../../../src/components/marketing/pricing-plan-switcher';

/** The visible plan panel's id. Exactly one panel may be visible. */
function shownPanels(container: HTMLElement) {
  return [...container.querySelectorAll('[role="tabpanel"]')]
    .filter((p) => !(p as HTMLElement).hidden)
    .map((p) => p.id);
}

describe('PricingPlanSwitcher (phone pricing)', () => {
  it('names all three plans on the switch and shows Essentials first', () => {
    const { container } = render(<PricingPlanSwitcher />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Essentials',
      'Professional',
      'Property Manager',
    ]);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(shownPanels(container)).toEqual(['mk-plan-essentials']);
  });

  it('wires each tab to its panel both ways', () => {
    const { container } = render(<PricingPlanSwitcher />);
    for (const tab of screen.getAllByRole('tab')) {
      const panel = container.querySelector(`#${tab.getAttribute('aria-controls')}`);
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
    }
  });

  it('shows the clicked plan and only that plan', () => {
    const { container } = render(<PricingPlanSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: 'Property Manager' }));
    expect(shownPanels(container)).toEqual(['mk-plan-manager']);
    expect(screen.getByRole('tab', { name: 'Property Manager' }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves with the arrow keys, wraps at both ends, and supports Home and End', () => {
    const { container } = render(<PricingPlanSwitcher />);
    const tab = (name: string) => screen.getByRole('tab', { name });

    fireEvent.keyDown(tab('Essentials'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Professional'));
    expect(shownPanels(container)).toEqual(['mk-plan-professional']);

    fireEvent.keyDown(tab('Professional'), { key: 'End' });
    expect(document.activeElement).toBe(tab('Property Manager'));

    fireEvent.keyDown(tab('Property Manager'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Essentials'));

    fireEvent.keyDown(tab('Essentials'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tab('Property Manager'));

    fireEvent.keyDown(tab('Property Manager'), { key: 'Home' });
    expect(shownPanels(container)).toEqual(['mk-plan-essentials']);
  });

  it('keeps only the selected tab in the Tab order', () => {
    render(<PricingPlanSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: 'Professional' }));
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('gives every plan its signup or contact link', () => {
    const { container } = render(<PricingPlanSwitcher />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/signup?plan=essentials&communityType=condo_718',
      '/signup?plan=professional&communityType=condo_718',
      '/contact',
    ]);
  });
});

// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepStrip } from '../step-strip';

const STEPS = ['Upload', 'Review', 'Import', 'Done'];

describe('StepStrip', () => {
  it('is an ordered list with one item per step, in order', () => {
    render(<StepStrip steps={STEPS} current={1} />);
    const list = screen.getByRole('list', { name: 'Steps' });
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('[data-step-name]')?.textContent)).toEqual(STEPS);
  });

  it('marks the current step, and only that one, with aria-current="step"', () => {
    render(<StepStrip steps={STEPS} current={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, null, 'step', null]);
  });

  it('says each state in words, not by colour alone', () => {
    render(<StepStrip steps={STEPS} current={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-state'))).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(items[0]).toHaveTextContent('Done: Upload');
    expect(items[1]).toHaveTextContent('Current step: Review');
    expect(items[2]).toHaveTextContent('Not started: Import');
  });

  it('numbers the steps, and shows a done step as a check mark hidden from assistive tech', () => {
    render(<StepStrip steps={STEPS} current={1} />);
    const items = screen.getAllByRole('listitem');
    const marks = items.map((li) => li.querySelector('[data-step-mark]')!);
    expect(marks.slice(1).map((m) => m.textContent)).toEqual(['2', '3', '4']);
    expect(marks[0]!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(marks[1]!.querySelector('svg')).toBeNull();
  });

  it('offers no navigation', () => {
    const { container } = render(<StepStrip steps={STEPS} current={3} />);
    expect(container.querySelector('a, button, [tabindex]')).toBeNull();
  });

  it('takes its own name when a page needs one', () => {
    render(<StepStrip steps={STEPS} current={0} label="Import steps" />);
    expect(screen.getByRole('list', { name: 'Import steps' })).toBeVisible();
  });
});

/**
 * axe audit of StepStrip, the page kit's step indicator.
 *
 * The clean case first asserts the strip rendered all its steps (an axe run
 * over an empty container passes). The probe puts a non-item child in the same
 * list and shows axe goes red there, so the audit provably reaches the list.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { StepStrip } from '@propertypro/ui/components/shared/step-strip';

const ruleIds = async (container: HTMLElement) =>
  (await axe(container)).violations.map((v) => v.id);

describe('StepStrip — axe', () => {
  it('a strip with done, current and upcoming steps has no violations', async () => {
    const { container } = render(<StepStrip steps={['Upload', 'Review', 'Import', 'Done']} current={1} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(container.querySelector('[aria-current="step"]')).toHaveTextContent('Review');
    expect(await ruleIds(container)).toEqual([]);
  });

  it('probe: axe reaches the list (a stray child in it is reported)', async () => {
    const { container } = render(<StepStrip steps={['Upload', 'Review']} current={0} />);
    container.querySelector('ol')!.appendChild(document.createElement('div')).textContent = 'stray';
    expect(await ruleIds(container)).toContain('list');
  });
});

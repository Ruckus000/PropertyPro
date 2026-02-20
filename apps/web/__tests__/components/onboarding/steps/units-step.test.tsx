import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UnitsStep } from '../../../../src/components/onboarding/steps/units-step';

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('units step', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('add row increments table row count', async () => {
    const onNext = vi.fn();

    await act(async () => {
      root.render(<UnitsStep onNext={onNext} onBack={vi.fn()} />);
      await flushEffects();
    });

    const initialRows = container.querySelectorAll('tbody tr').length;

    const addButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '+ Add Another Unit',
    );

    await act(async () => {
      addButton?.click();
      await flushEffects();
    });

    const updatedRows = container.querySelectorAll('tbody tr').length;
    expect(updatedRows).toBe(initialRows + 1);
  });

  it('remove row decrements table row count', async () => {
    const onNext = vi.fn();

    await act(async () => {
      root.render(
        <UnitsStep
          onNext={onNext}
          onBack={vi.fn()}
          initialData={[{ unitNumber: '101' }, { unitNumber: '102' }]}
        />,
      );
      await flushEffects();
    });

    const initialRows = container.querySelectorAll('tbody tr').length;

    const removeButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remove',
    );

    await act(async () => {
      removeButton?.click();
      await flushEffects();
    });

    const updatedRows = container.querySelectorAll('tbody tr').length;
    expect(updatedRows).toBe(initialRows - 1);
  });

  it('empty unit number prevents submit', async () => {
    const onNext = vi.fn();

    await act(async () => {
      root.render(
        <UnitsStep
          onNext={onNext}
          onBack={vi.fn()}
          initialData={[{ unitNumber: '' }]}
        />,
      );
      await flushEffects();
    });

    const form = container.querySelector('form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushEffects();
    });

    expect(onNext).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Each unit row must include a unit number.');
  });

  it('pre-populates rows from initial data', async () => {
    const onNext = vi.fn();

    await act(async () => {
      root.render(
        <UnitsStep
          onNext={onNext}
          onBack={vi.fn()}
          initialData={[
            { unitNumber: 'A101', bedrooms: 2, bathrooms: 1 },
            { unitNumber: 'A102', bedrooms: 1, bathrooms: 1 },
          ]}
        />,
      );
      await flushEffects();
    });

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    const unitInputs = Array.from(container.querySelectorAll('tbody tr input[type="text"]')).filter(
      (input) => (input as HTMLInputElement).placeholder === '101',
    ) as HTMLInputElement[];

    expect(unitInputs[0]?.value).toBe('A101');
    expect(unitInputs[1]?.value).toBe('A102');
  });
});

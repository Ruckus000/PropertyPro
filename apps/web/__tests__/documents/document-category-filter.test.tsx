import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentCategoryFilter } from '../../src/components/documents/document-category-filter';

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('document category filter', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // Needed for React act() assertions in Vitest/jsdom.
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
    vi.unstubAllGlobals();
  });

  it('renders empty-state message when no categories are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <DocumentCategoryFilter
          communityId={42}
          selectedCategoryId={null}
          onCategoryChange={vi.fn()}
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain('No categories configured yet.');
    expect(container.textContent).toContain('All');
  });

  it('renders category chips when categories are available', async () => {
    const onCategoryChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, name: 'Rules', description: null },
          { id: 2, name: 'Meeting Minutes', description: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(
        <DocumentCategoryFilter
          communityId={42}
          selectedCategoryId={null}
          onCategoryChange={onCategoryChange}
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain('Rules');
    expect(container.textContent).toContain('Meeting Minutes');

    const rulesButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Rules',
    );
    expect(rulesButton).toBeDefined();

    rulesButton?.click();
    expect(onCategoryChange).toHaveBeenCalledWith(1);
  });
});

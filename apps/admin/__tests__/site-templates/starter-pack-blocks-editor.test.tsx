// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StarterPackBlocksEditor, type EditorBlock } from '@/components/site-templates/StarterPackBlocksEditor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let captured: EditorBlock[] = [];

function Host({ initial }: { initial: EditorBlock[] }) {
  const [blocks, setBlocks] = useState(initial);
  captured = blocks;
  return (
    <StarterPackBlocksEditor
      value={blocks}
      onChange={(n) => {
        captured = n;
        setBlocks(n);
      }}
    />
  );
}

function render(initial: EditorBlock[]) {
  act(() => root.render(<Host initial={initial} />));
}
function q<T extends Element = HTMLElement>(testid: string): T {
  return container.querySelector(`[data-testid="${testid}"]`) as T;
}
function clearText(testid: string) {
  const el = q<HTMLInputElement>(testid);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function clickCheckbox(testid: string) {
  const el = q<HTMLInputElement>(testid);
  act(() => el.click());
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  captured = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('StarterPackBlocksEditor — cleared optional text fields drop the key', () => {
  it('removes an optional field key when its text input is cleared', () => {
    render([{ blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome', subtitle: 'A community' } }]);
    clearText('field-0-subtitle');
    // The cleared optional field must be ABSENT, not an empty string (empty string
    // fails the hero schema's .min(1) and would surface a spurious server error).
    expect('subtitle' in captured[0]!.content).toBe(false);
    // Other fields are untouched.
    expect(captured[0]!.content.headline).toBe('Welcome');
  });

  it('also drops a required field key when cleared (server then reports it as required)', () => {
    render([{ blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } }]);
    clearText('field-0-headline');
    expect('headline' in captured[0]!.content).toBe(false);
  });
});

describe('StarterPackBlocksEditor — documents categories are a fixed checkbox group', () => {
  it('renders a checkbox for each allowed category and none others', () => {
    render([{ blockType: 'documents', blockOrder: 2, content: { limit: 5 } }]);
    for (const cat of ['budget', 'minutes', 'financial', 'rules', 'other']) {
      expect(q(`field-0-cat-${cat}`)).toBeTruthy();
    }
    // No free-text categories input remains.
    expect(q('field-0-includeCategories')).toBeFalsy();
  });

  it('toggles categories into includeCategories in canonical order', () => {
    render([{ blockType: 'documents', blockOrder: 2, content: { limit: 5 } }]);
    clickCheckbox('field-0-cat-minutes');
    clickCheckbox('field-0-cat-budget');
    // Canonical order (budget before minutes), regardless of click order.
    expect(captured[0]!.content.includeCategories).toEqual(['budget', 'minutes']);
  });

  it('drops the includeCategories key when the last category is unchecked', () => {
    render([{ blockType: 'documents', blockOrder: 2, content: { limit: 5, includeCategories: ['budget'] } }]);
    clickCheckbox('field-0-cat-budget');
    expect('includeCategories' in captured[0]!.content).toBe(false);
  });
});

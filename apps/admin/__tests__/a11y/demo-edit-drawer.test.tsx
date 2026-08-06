// @vitest-environment jsdom
/**
 * The demo edit drawer had `role`-less markup and, worse, stayed MOUNTED when
 * closed — translated off-screen rather than unmounted, so its whole form
 * remained in the tab order. A keyboard user tabbing through the demo list
 * fell into a form they could not see. It also had no Escape handler and did
 * not restore focus on close.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DemoEditDrawer } from '@/components/demo/DemoEditDrawer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The drawer fetches branding on open; keep it inert and offline.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: {} }),
  }),
);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(isOpen: boolean, onClose = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DemoEditDrawer
        isOpen={isOpen}
        onClose={onClose}
        demoId={1}
        communityId={1}
        prospectName="Test Demo"
        onSaved={() => {}}
        previewTab="public"
      />,
    );
  });
  return container.querySelector('[role="dialog"]') as HTMLElement;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('DemoEditDrawer accessibility', () => {
  it('is a labelled modal dialog', async () => {
    const panel = await render(true);

    expect(panel).toBeTruthy();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const labelId = panel.getAttribute('aria-labelledby');
    expect(labelId).toBe('edit-demo-title');
    expect(document.getElementById(labelId!)?.textContent).toBe('Edit Demo');
  });

  // The load-bearing one. The panel stays mounted for the slide transition, so
  // without `inert` its inputs, code editor and save button are all reachable
  // by Tab while the drawer is visually closed.
  it('is inert when closed, and not when open', async () => {
    const closed = await render(false);
    expect(closed.hasAttribute('inert')).toBe(true);

    await act(async () => root!.unmount());
    container!.remove();
    root = null;

    const open = await render(true);
    expect(open.hasAttribute('inert')).toBe(false);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    await render(true, onClose);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when it was never open', async () => {
    const onClose = vi.fn();
    await render(false, onClose);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives the icon-only close button an accessible name', async () => {
    const panel = await render(true);

    expect(panel.querySelector('[aria-label="Close edit demo drawer"]')).toBeTruthy();
  });

  it('exposes its tabs as tabs, not bare buttons', async () => {
    const panel = await render(true);

    const tablist = panel.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute('aria-label')).toBe('Demo settings sections');
    const tabs = panel.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(Array.from(tabs).filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(panel.querySelector('[role="tabpanel"]')).toBeTruthy();
  });
});

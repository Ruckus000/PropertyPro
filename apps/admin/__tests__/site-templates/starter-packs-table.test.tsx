// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StarterPacksTable, type StarterPackRow } from '@/components/site-templates/StarterPacksTable';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); global.fetch = vi.fn(); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const PACKS: StarterPackRow[] = [
  { id: 1, slug: 'florida-condo-v1', displayName: 'FL Condo', communityType: 'condo_718', description: null, blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'Hi' } }, { blockType: 'contact', blockOrder: 2, content: { showBoard: true, showManagement: true } }], version: 1, isArchived: false, createdAt: 't', updatedAt: 't' },
  { id: 2, slug: 'apartment-v1', displayName: 'Apt', communityType: 'apartment', description: null, blocks: [], version: 1, isArchived: false, createdAt: 't', updatedAt: 't' },
];

function render(packs: StarterPackRow[]) { act(() => root.render(<StarterPacksTable packs={packs} />)); }
function click(testid: string) { const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement; act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); }

describe('StarterPacksTable', () => {
  it('renders all packs and a type filter', () => {
    render(PACKS);
    expect(container.querySelector('[data-testid="pack-row-florida-condo-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pack-row-apartment-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="type-filter"]')).toBeTruthy();
  });

  it('filters by community type', () => {
    render(PACKS);
    const filter = container.querySelector('[data-testid="type-filter"]') as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    act(() => { setter.call(filter, 'apartment'); filter.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[data-testid="pack-row-apartment-v1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pack-row-florida-condo-v1"]')).toBeFalsy();
  });

  it('Archive POSTs DELETE then refreshes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ archived: true, deleted: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    await act(async () => { click('pack-archive-florida-condo-v1'); });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1');
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('Edit → Save PATCHes blocks', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pack: PACKS[0] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    click('pack-editbtn-florida-condo-v1');
    await act(async () => { click('pack-save-florida-condo-v1'); });
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1');
    expect(call[1]).toMatchObject({ method: 'PATCH' });
  });

  it('Save as new version POSTs to new-version', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pack: { ...PACKS[0], slug: 'florida-condo-v2', version: 2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ packs: PACKS }) });
    render(PACKS);
    click('pack-editbtn-florida-condo-v1');
    await act(async () => { click('pack-newversion-florida-condo-v1'); });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/site-templates/starter-packs/florida-condo-v1/new-version');
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LayoutsTable, diffLayout, type LayoutRow } from '@/components/site-templates/LayoutsTable';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderTable(layouts: LayoutRow[]): Promise<string> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<LayoutsTable layouts={layouts} />);
  });
  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

const SAMPLE: LayoutRow = {
  id: 1,
  slug: 'tidewater',
  displayName: 'Tidewater',
  tagline: 'Coastal editorial · for the waterfront',
  description: 'Coastal editorial. Golden-hour palette.',
  tier: 'essentials',
  isArchived: false,
  isFeatured: true,
  defaultPresetSlug: 'bay-light',
  version: '1.0.0',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

describe('LayoutsTable', () => {
  it('renders an empty state when no layouts are supplied', async () => {
    const html = await renderTable([]);
    expect(html).toContain('No layouts configured');
  });

  it('renders the layout display name + slug', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Tidewater');
    expect(html).toContain('tidewater');
  });

  it('renders the tagline and description', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Coastal editorial · for the waterfront');
    expect(html).toContain('Golden-hour palette');
  });

  it('renders the default preset slug', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('bay-light');
  });

  it('renders em dash when no default preset slug is set', async () => {
    const noPreset: LayoutRow = { ...SAMPLE, defaultPresetSlug: null };
    const html = await renderTable([noPreset]);
    expect(html).toContain('—');
  });

  it('renders the version string', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('1.0.0');
  });

  it('renders "Archived" status when archived', async () => {
    const archived: LayoutRow = { ...SAMPLE, isArchived: true };
    const html = await renderTable([archived]);
    expect(html).toContain('Archived');
  });

  it('renders "Active" status when not archived', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Active');
  });

  it('renders rows for multiple layouts', async () => {
    const second: LayoutRow = {
      ...SAMPLE,
      id: 2,
      slug: 'boulevard',
      displayName: 'Boulevard',
      tagline: null,
      description: null,
    };
    const html = await renderTable([SAMPLE, second]);
    expect(html).toContain('Tidewater');
    expect(html).toContain('Boulevard');
  });
});

describe('diffLayout', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(diffLayout(SAMPLE, { ...SAMPLE })).toEqual({});
  });

  it('includes only changed fields and trims displayName', () => {
    const patch = diffLayout(SAMPLE, { ...SAMPLE, displayName: '  Tidewater 2  ', tier: 'professional' });
    expect(patch).toEqual({ displayName: 'Tidewater 2', tier: 'professional' });
  });

  it('maps a cleared tagline to null', () => {
    expect(diffLayout(SAMPLE, { ...SAMPLE, tagline: '   ' })).toEqual({ tagline: null });
  });

  it('captures featured/archived toggles', () => {
    expect(diffLayout(SAMPLE, { ...SAMPLE, isFeatured: false, isArchived: true })).toEqual({
      isFeatured: false,
      isArchived: true,
    });
  });
});

// ── Interactive edit flow ───────────────────────────────────────────────
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('LayoutsTable editing', () => {
  let container: HTMLDivElement;
  let root: Root;

  async function mount(layouts: LayoutRow[]) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<LayoutsTable layouts={layouts} />);
    });
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('opens a seeded edit form when Edit is clicked', async () => {
    await mount([SAMPLE]);
    expect(container.querySelector('[data-testid="layout-edit-form-tidewater"]')).toBeNull();

    const editBtn = container.querySelector('[data-testid="layout-edit-tidewater"]') as HTMLButtonElement;
    await act(async () => editBtn.click());

    const nameInput = container.querySelector('[data-testid="layout-edit-displayName-tidewater"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toBe('Tidewater');
    const tierSelect = container.querySelector('[data-testid="layout-edit-tier-tidewater"]') as HTMLSelectElement;
    expect(tierSelect.value).toBe('essentials');
  });

  it('PATCHes only the changed field and applies the server response', async () => {
    const updated: LayoutRow = { ...SAMPLE, displayName: 'Tidewater Deluxe' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ layout: updated }) } as Response);

    await mount([SAMPLE]);
    const editBtn = container.querySelector('[data-testid="layout-edit-tidewater"]') as HTMLButtonElement;
    await act(async () => editBtn.click());

    const nameInput = container.querySelector('[data-testid="layout-edit-displayName-tidewater"]') as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'Tidewater Deluxe'));

    const form = container.querySelector('[data-testid="layout-edit-form-tidewater"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/site-templates/layouts/tidewater');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ displayName: 'Tidewater Deluxe' });
    // Form closed; updated value reflected in the read-only row.
    expect(container.querySelector('[data-testid="layout-edit-form-tidewater"]')).toBeNull();
    expect(container.innerHTML).toContain('Tidewater Deluxe');
  });

  it('does not call the API when submitting with no changes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await mount([SAMPLE]);
    const editBtn = container.querySelector('[data-testid="layout-edit-tidewater"]') as HTMLButtonElement;
    await act(async () => editBtn.click());
    const form = container.querySelector('[data-testid="layout-edit-form-tidewater"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="layout-edit-form-tidewater"]')).toBeNull();
  });

  it('surfaces the server error and keeps the form open', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Boom' } }),
    } as Response);

    await mount([SAMPLE]);
    const editBtn = container.querySelector('[data-testid="layout-edit-tidewater"]') as HTMLButtonElement;
    await act(async () => editBtn.click());
    const nameInput = container.querySelector('[data-testid="layout-edit-displayName-tidewater"]') as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'Changed'));
    const form = container.querySelector('[data-testid="layout-edit-form-tidewater"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });

    expect(container.innerHTML).toContain('Boom');
    expect(container.querySelector('[data-testid="layout-edit-form-tidewater"]')).not.toBeNull();
  });
});

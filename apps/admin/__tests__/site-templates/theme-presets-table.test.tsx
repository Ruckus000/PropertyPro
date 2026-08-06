// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ThemePresetsTable,
  diffPreset,
  draftFrom,
  type ThemePresetRow,
} from '@/components/site-templates/ThemePresetsTable';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderTable(presets: ThemePresetRow[]): Promise<string> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<ThemePresetsTable presets={presets} />);
  });
  const html = container.innerHTML;
  await act(async () => {
    root.unmount();
  });
  return html;
}

const SAMPLE: ThemePresetRow = {
  id: 1,
  slug: 'bay-light',
  displayName: 'Bay Light',
  description: 'Tidewater default — warm ivory ground.',
  tokens: {
    primaryColor: '#0e3338',
    secondaryColor: '#f6f1e6',
    accentColor: '#c66f49',
    headingFont: 'Fraunces',
    bodyFont: 'Manrope',
  },
  tier: 'essentials',
  isArchived: false,
  isFeatured: true,
  version: 1,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

describe('ThemePresetsTable', () => {
  it('renders an empty state when no presets are supplied', async () => {
    const html = await renderTable([]);
    expect(html).toContain('No theme presets configured');
  });

  it('renders the preset display name + slug', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Bay Light');
    expect(html).toContain('bay-light');
  });

  it('renders the tier badge', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html.toLowerCase()).toContain('essentials');
  });

  it('renders an "Archived" status when the preset is archived', async () => {
    const archived: ThemePresetRow = { ...SAMPLE, isArchived: true };
    const html = await renderTable([archived]);
    expect(html).toContain('Archived');
  });

  it('renders an "Active" status when the preset is not archived', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Active');
  });

  it('renders token swatches using the supplied colors', async () => {
    const html = await renderTable([SAMPLE]);
    // The swatch <span> uses inline background-color.
    expect(html).toContain('#0e3338');
    expect(html).toContain('#f6f1e6');
    expect(html).toContain('#c66f49');
  });

  it('renders font names beneath the swatches', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Fraunces');
    expect(html).toContain('Manrope');
  });

  it('renders the description', async () => {
    const html = await renderTable([SAMPLE]);
    expect(html).toContain('Tidewater default');
  });

  it('renders rows for multiple presets', async () => {
    const second: ThemePresetRow = {
      ...SAMPLE,
      id: 2,
      slug: 'palm-shadow',
      displayName: 'Palm Shadow',
      isFeatured: false,
    };
    const html = await renderTable([SAMPLE, second]);
    expect(html).toContain('Bay Light');
    expect(html).toContain('Palm Shadow');
  });
});

describe('diffPreset', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(diffPreset(SAMPLE, draftFrom(SAMPLE))).toEqual({});
  });

  it('includes only changed metadata fields and trims', () => {
    const patch = diffPreset(SAMPLE, { ...draftFrom(SAMPLE), displayName: '  Bay Light 2  ', tier: 'professional' });
    expect(patch).toEqual({ displayName: 'Bay Light 2', tier: 'professional' });
  });

  it('sends the full token bundle when any token changed (version bump)', () => {
    const draft = draftFrom(SAMPLE);
    draft.tokens = { ...draft.tokens, accentColor: '#123456' };
    expect(diffPreset(SAMPLE, draft)).toEqual({
      tokens: {
        primaryColor: '#0e3338',
        secondaryColor: '#f6f1e6',
        accentColor: '#123456',
        headingFont: 'Fraunces',
        bodyFont: 'Manrope',
      },
    });
  });

  it('maps a cleared description to null', () => {
    expect(diffPreset(SAMPLE, { ...draftFrom(SAMPLE), description: '   ' })).toEqual({ description: null });
  });
});

// ── Interactive edit flow ───────────────────────────────────────────────
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ThemePresetsTable editing', () => {
  let container: HTMLDivElement;
  let root: Root;

  async function mount(presets: ThemePresetRow[]) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<ThemePresetsTable presets={presets} />);
    });
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  async function openEditor() {
    const editBtn = container.querySelector('[data-testid="preset-edit-bay-light"]') as HTMLButtonElement;
    await act(async () => editBtn.click());
  }

  async function submit() {
    const form = container.querySelector('[data-testid="preset-edit-form-bay-light"]') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });
  }

  it('PATCHes only a changed metadata field', async () => {
    const updated: ThemePresetRow = { ...SAMPLE, displayName: 'Bay Light 2' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ preset: updated }) } as Response);

    await mount([SAMPLE]);
    await openEditor();
    const nameInput = container.querySelector('[data-testid="preset-edit-displayName-bay-light"]') as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'Bay Light 2'));
    await submit();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/site-templates/theme-presets/bay-light');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ displayName: 'Bay Light 2' });
    expect(container.innerHTML).toContain('Bay Light 2');
  });

  it('sends the full token bundle when a color is edited', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ preset: { ...SAMPLE, version: 2 } }) } as Response);

    await mount([SAMPLE]);
    await openEditor();
    const accentInput = container.querySelector('[data-testid="preset-edit-accentColor-bay-light"]') as HTMLInputElement;
    await act(async () => setInputValue(accentInput, '#123456'));
    await submit();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.tokens).toEqual({
      primaryColor: '#0e3338',
      secondaryColor: '#f6f1e6',
      accentColor: '#123456',
      headingFont: 'Fraunces',
      bodyFont: 'Manrope',
    });
  });

  it('does not call the API when submitting with no changes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await mount([SAMPLE]);
    await openEditor();
    await submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="preset-edit-form-bay-light"]')).toBeNull();
  });

  it('surfaces the server error and keeps the form open', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Boom' } }),
    } as Response);
    await mount([SAMPLE]);
    await openEditor();
    const nameInput = container.querySelector('[data-testid="preset-edit-displayName-bay-light"]') as HTMLInputElement;
    await act(async () => setInputValue(nameInput, 'Changed'));
    await submit();
    expect(container.innerHTML).toContain('Boom');
    expect(container.querySelector('[data-testid="preset-edit-form-bay-light"]')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemePresetsTable,
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

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LayoutsTable, type LayoutRow } from '@/components/site-templates/LayoutsTable';

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
